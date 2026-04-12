import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError } from "@/lib/middleware/helpers";
import { conversationToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const id = ctx.params?.id;
  if (!id) {
    return writeError("conversation id is required", 400);
  }

  const conversation = await queries.conversation.getConversation(db, id);
  if (!conversation || conversation.workspaceId !== ws.workspaceId) {
    return writeError("conversation not found", 404);
  }

  return writeJSON(conversationToResponse(conversation));
});

export const DELETE = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const id = ctx.params?.id;
  if (!id) {
    return writeError("conversation id is required", 400);
  }

  const conversation = await queries.conversation.getConversation(db, id);
  if (!conversation || conversation.workspaceId !== ws.workspaceId) {
    return writeError("conversation not found", 404);
  }

  // Delete tasks first (no cascade on FK)
  await queries.task.deleteTasksByConversation(db, id);
  // Messages cascade automatically via schema
  await queries.conversation.deleteConversation(db, id);

  return new Response(null, { status: 204 });
});
