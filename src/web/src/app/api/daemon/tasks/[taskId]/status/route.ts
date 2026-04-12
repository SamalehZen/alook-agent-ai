import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError } from "@/lib/middleware/helpers";

export const GET = withAuth(async (_req, ctx) => {
  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const taskId = ctx.params?.taskId;
  if (!taskId) {
    return writeError("task_id is required", 400);
  }

  const status = await queries.task.getTaskStatus(db, taskId);
  if (!status) {
    return writeError("task not found", 404);
  }

  return writeJSON({ status });
});
