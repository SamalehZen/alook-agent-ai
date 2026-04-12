import { headers } from "next/headers"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createAuth } from "@/lib/auth"

export async function getSession() {
  const { env } = await getCloudflareContext({ async: true })
  const auth = createAuth(env as Env)
  return auth.api.getSession({ headers: await headers() })
}

export async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")
  return session
}
