import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries, isUniqueConstraintError } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError } from "@/lib/middleware/helpers";
import { workspaceToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (_req, ctx) => {
  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const workspaces = await queries.workspace.listWorkspaces(db, ctx.userId);
  return writeJSON(workspaces.map(workspaceToResponse));
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  let body: { name?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return writeError("invalid request body", 400);
  }

  const name = (body.name || "").trim();
  const slug = (body.slug || "").toLowerCase().trim();

  if (!name) {
    return writeError("name is required", 400);
  }
  if (!slug) {
    return writeError("slug is required", 400);
  }

  try {
    const ws = await queries.workspace.createWorkspace(db, { name, slug });
    await queries.member.createMember(db, {
      workspaceId: ws.id,
      userId: ctx.userId,
      role: "owner",
    });
    return writeJSON(workspaceToResponse(ws), 201);
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return writeError("workspace slug already exists", 409);
    }
    throw err;
  }
});
