import { getCloudflareContext } from "@opennextjs/cloudflare";
import { queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { writeJSON } from "@/lib/middleware/helpers";
import { generateMachineToken } from "@/lib/token";

function authorized(req: Request, env: Env) {
  const secret = env.RUNTIME_MANAGER_SECRET;
  return !!secret && req.headers.get("X-Runtime-Manager-Secret") === secret;
}

export async function POST(req: Request) {
  const { env } = await getCloudflareContext({ async: true });
  if (!authorized(req, env as Env)) {
    return writeJSON({ error: "unauthorized" }, 401);
  }

  let body: { workspace_id?: string };
  try {
    body = await req.json();
  } catch {
    return writeJSON({ error: "invalid request body" }, 400);
  }

  const workspaceId = body.workspace_id;
  if (!workspaceId) {
    return writeJSON({ error: "workspace_id is required" }, 400);
  }

  const db = getDb((env as Env).DB);
  const existing = await queries.machineToken.getActiveMachineTokenForWorkspace(db, workspaceId);
  if (existing) {
    return writeJSON({ token: existing.token, workspace_id: workspaceId });
  }

  const members = await queries.member.listMembers(db, workspaceId);
  const owner = members.find((m) => m.role === "owner") ?? members[0];
  if (!owner) {
    return writeJSON({ error: "workspace has no members" }, 404);
  }

  const token = generateMachineToken();
  await queries.machineToken.createMachineToken(db, {
    userId: owner.userId,
    workspaceId,
    token,
    name: "managed-runtime",
    status: "active",
  });

  return writeJSON({ token, workspace_id: workspaceId }, 201);
}
