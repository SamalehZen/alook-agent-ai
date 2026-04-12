import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries } from "@alook/shared"

export async function withToken(request: Request) {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: new Response("Unauthorized", { status: 401 }), machineToken: null }
  }
  const raw = authHeader.slice(7)
  if (!raw.startsWith("al_")) {
    return { error: new Response("Invalid token format", { status: 401 }), machineToken: null }
  }
  const { env } = await getCloudflareContext({ async: true })
  const db = createDb((env as Env).DB)
  const mt = await queries.machineToken.getMachineTokenByToken(db, raw)
  if (!mt) {
    return { error: new Response("Token not found", { status: 401 }), machineToken: null }
  }
  queries.machineToken.updateMachineTokenLastUsed(db, mt.id).catch(() => {})
  return { error: null, machineToken: mt }
}
