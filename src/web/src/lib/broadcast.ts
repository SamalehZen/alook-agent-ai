import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { WsMessage } from "@alook/shared"
import { DEV_WS_DO_URL } from "@alook/shared"

export async function broadcastToUser(userId: string, message: WsMessage) {
  const body = JSON.stringify(message)
  const url = `/broadcast/user/${userId}`

  // In dev, service bindings from OpenNext don't route to ws-do.
  // Try service binding first, fall back to direct HTTP.
  try {
    const { env } = getCloudflareContext()
    const wsEnv = env as Env
    await wsEnv.WS_DO_WORKER.fetch(`http://internal${url}`, {
      method: "POST",
      body,
    })
  } catch {
    await fetch(`${DEV_WS_DO_URL}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
  }
}

export async function broadcastToAgent(agentId: string, message: WsMessage) {
  const body = JSON.stringify(message)
  const url = `/broadcast/${agentId}`

  try {
    const { env } = getCloudflareContext()
    const wsEnv = env as Env
    await wsEnv.WS_DO_WORKER.fetch(`http://internal${url}`, {
      method: "POST",
      body,
    })
  } catch {
    await fetch(`${DEV_WS_DO_URL}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
  }
}
