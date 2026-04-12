import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";
import { HeartbeatRequestSchema } from "@alook/shared";
import { TaskService } from "@/lib/services/task";
import { broadcastToUser } from "@/lib/broadcast";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const [body, err] = await parseBody(req, HeartbeatRequestSchema);
  if (err) return err;

  if (!ctx.workspaceId) {
    return writeError("Forbidden: machine token required", 403);
  }

  const runtime = await queries.runtime.getAgentRuntimeForWorkspace(
    db,
    body.runtime_id,
    ctx.workspaceId
  );
  if (!runtime) {
    return writeError("Runtime not found", 404);
  }

  await queries.runtime.updateAgentRuntimeHeartbeat(db, body.runtime_id);

  // Notify web UI of status change
  broadcastToUser(ctx.userId, {
    type: "runtime.status",
    runtimeId: body.runtime_id,
    status: "online",
  }).catch(() => {});

  // Mark runtimes that haven't sent a heartbeat in >45s as offline
  await queries.runtime.markStaleRuntimesOffline(db, ctx.workspaceId);

  // Fail tasks stuck in "dispatched" for >20s (daemon likely crashed)
  const stale = await queries.task.failStaleDispatchedTasks(db);
  if (stale.length > 0) {
    const taskService = new TaskService(db);
    const agentIds = [...new Set(stale.map((r) => r.agentId))];
    for (const agentId of agentIds) {
      await taskService.reconcileAgentStatus(agentId);
    }
  }

  return writeJSON({ status: "ok" });
});
