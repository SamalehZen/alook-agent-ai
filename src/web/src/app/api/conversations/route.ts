import { NextRequest } from "next/server";
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

  const conversations = await queries.conversation.listConversations(
    db,
    ws.workspaceId,
    ctx.userId
  );
  return writeJSON(conversations.map(conversationToResponse));
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  let body: { agent_id?: string };
  try {
    body = await req.json();
  } catch {
    return writeError("invalid request body", 400);
  }

  const agentId = body.agent_id || "";
  if (!agentId) {
    return writeError("agent_id is required", 400);
  }

  const conversation = await queries.conversation.createConversation(db, {
    workspaceId: ws.workspaceId,
    agentId,
    userId: ctx.userId,
    title: "",
  });

  return writeJSON(conversationToResponse(conversation), 201);
});
