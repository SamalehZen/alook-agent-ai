import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, queries } from "@alook/shared";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeError } from "@/lib/middleware/helpers";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext();
  const db = createDb((env as Env).DB);

  const id = ctx.params?.id;
  if (!id) return writeError("email id is required", 400);

  const email = await queries.email.getEmailById(db, id);
  if (!email) return writeError("email not found", 404);

  const agent = await queries.agent.getAgentInWorkspace(db, email.agentId, ws.workspaceId);
  if (!agent) return writeError("email not found", 404);

  const object = await (env as Env).EMAIL_BUCKET.get(email.r2Key);
  if (!object) {
    return new Response("Email body not available", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const raw = await object.text();
  // RFC822: headers and body are separated by a blank line
  const crlfIdx = raw.indexOf("\r\n\r\n");
  const lfIdx = raw.indexOf("\n\n");
  const sepIdx = crlfIdx !== -1 ? crlfIdx : lfIdx;
  const sepLen = crlfIdx !== -1 ? 4 : 2;
  const bodyText = sepIdx !== -1 ? raw.slice(sepIdx + sepLen) : raw;

  return new Response(bodyText, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
