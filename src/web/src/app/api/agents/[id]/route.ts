import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError } from "@/lib/middleware/helpers";
import { agentToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const id = ctx.params?.id;
  if (!id) {
    return writeError("agent id is required", 400);
  }

  const agent = await queries.agent.getAgentInWorkspace(db, id, ws.workspaceId);
  if (!agent) {
    return writeError("agent not found", 404);
  }

  return writeJSON(agentToResponse(agent));
});

export const PATCH = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const id = ctx.params?.id;
  if (!id) {
    return writeError("agent id is required", 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return writeError("invalid request body", 400);
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.instructions === "string") data.instructions = body.instructions;
  if (typeof body.runtime_id === "string") data.runtimeId = body.runtime_id;

  if (Object.keys(data).length === 0) {
    return writeError("no fields to update", 400);
  }

  const updated = await queries.agent.updateAgent(db, id, ws.workspaceId, data as { name?: string; description?: string; instructions?: string; runtimeId?: string });
  if (!updated) {
    return writeError("agent not found", 404);
  }

  return writeJSON(agentToResponse(updated));
});

export const DELETE = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const id = ctx.params?.id;
  if (!id) {
    return writeError("agent id is required", 400);
  }

  const deleted = await queries.agent.deleteAgent(db, id, ws.workspaceId);
  if (!deleted) {
    return writeError("agent not found", 404);
  }

  return new Response(null, { status: 204 });
});
