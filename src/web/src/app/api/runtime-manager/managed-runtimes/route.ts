import { getCloudflareContext } from "@opennextjs/cloudflare";
import { queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { writeJSON } from "@/lib/middleware/helpers";

function authorized(req: Request, env: Env) {
  const secret = env.RUNTIME_MANAGER_SECRET;
  return !!secret && req.headers.get("X-Runtime-Manager-Secret") === secret;
}

export async function GET(req: Request) {
  const { env } = await getCloudflareContext({ async: true });
  if (!authorized(req, env as Env)) {
    return writeJSON({ error: "unauthorized" }, 401);
  }

  const db = getDb((env as Env).DB);
  const runtimes = await queries.runtime.listManagedAgentRuntimes(db);
  return writeJSON({ runtimes });
}
