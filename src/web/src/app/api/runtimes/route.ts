import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON } from "@/lib/middleware/helpers";
import { runtimeToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  // Mark runtimes that haven't sent a heartbeat in >45s as offline
  await queries.runtime.markStaleRuntimesOffline(db, ws.workspaceId);

  const runtimes = await queries.runtime.listAgentRuntimes(db, ws.workspaceId);
  return writeJSON(runtimes.map(runtimeToResponse));
});
