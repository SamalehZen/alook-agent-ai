import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, parseBody } from "@/lib/middleware/helpers";
import { runtimeToResponse } from "@/lib/api/responses";
import { RegisterDaemonRequestSchema } from "@alook/shared";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  const [body, err] = await parseBody(req, RegisterDaemonRequestSchema);
  if (err) return err;

  const { workspace_id: workspaceId, daemon_id: daemonId, device_name: deviceName, cli_version: cliVersion, runtimes } = body;

  const membership = await queries.member.getMemberByUserAndWorkspace(
    db,
    ctx.userId,
    workspaceId
  );
  if (!membership) {
    return writeJSON({ error: "workspace not found" }, 404);
  }

  const results = [];
  for (const rt of runtimes) {
    const provider = (rt.type || rt.provider || "unknown").trim();
    const runtimeMode = rt.runtime_mode || "local";
    let name = (rt.name || "").trim();
    if (!name) {
      name = deviceName ? `${provider} (${deviceName})` : provider;
    }
    const deviceInfo = deviceName.trim();
    const status = rt.status === "offline" ? "offline" : "online";
    const metadata: Record<string, unknown> = {
      version: rt.version || "",
      cli_version: cliVersion,
    };

    const result = await queries.runtime.upsertAgentRuntime(db, {
      workspaceId,
      daemonId,
      name,
      runtimeMode,
      provider,
      status,
      deviceInfo,
      metadata,
    });
    results.push(result);
  }

  return writeJSON({ runtimes: results.map(runtimeToResponse) });
});
