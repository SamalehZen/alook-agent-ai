import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, queries, ActivateTokenRequestSchema } from "@alook/shared";
import { writeJSON } from "@/lib/middleware/helpers";
import { runtimeToResponse } from "@/lib/api/responses";
import { broadcastToUser } from "@/lib/broadcast";

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return writeJSON({ error: "invalid request body" }, 400);
  }

  const parsed = ActivateTokenRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return writeJSON({ error: "invalid payload", details: parsed.error.flatten() }, 400);
  }

  const { token, hostname, runtimes } = parsed.data;

  const { env } = await getCloudflareContext({ async: true });
  const db = createDb((env as Env).DB);

  const mt = await queries.machineToken.getMachineTokenByToken(db, token);
  if (!mt) {
    return writeJSON({ error: "token not found" }, 404);
  }
  if (mt.status !== "pending") {
    return writeJSON({ error: "token already used" }, 409);
  }

  // Use hostname as daemonId — must match what the daemon uses (os.hostname())
  // so that daemon start's upsert hits the same records instead of creating duplicates
  const daemonId = hostname;
  const results = [];

  for (const rt of runtimes) {
    const name = `${rt.type} (${hostname})`;
    const result = await queries.runtime.upsertAgentRuntime(db, {
      workspaceId: mt.workspaceId,
      daemonId,
      name,
      runtimeMode: "local",
      provider: rt.type,
      status: "offline",
      deviceInfo: hostname,
      metadata: { version: rt.version },
    });
    results.push(result);
  }

  await queries.machineToken.activateMachineToken(db, mt.id);

  // Notify the web UI
  broadcastToUser(mt.userId, {
    type: "runtime.registered",
    daemonId,
    hostname,
  }).catch(() => {});

  return writeJSON({
    daemon_id: daemonId,
    runtimes: results.map(runtimeToResponse),
  });
}
