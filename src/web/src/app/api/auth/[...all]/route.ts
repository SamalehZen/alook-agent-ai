import { toNextJsHandler } from "better-auth/next-js"
import { createAuth } from "@/lib/auth"
import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function GET(request: Request) {
  const { env } = getCloudflareContext()
  return toNextJsHandler(createAuth(env as Env)).GET(request)
}

export async function POST(request: Request) {
  const { env } = getCloudflareContext()
  return toNextJsHandler(createAuth(env as Env)).POST(request)
}
