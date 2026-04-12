import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createAuth } from "@/lib/auth"

export async function GET(request: Request) {
  const { env } = getCloudflareContext()
  const auth = createAuth(env as Env)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return new Response("Unauthorized", { status: 401 })

  return Response.json({
    userId: session.user.id,
    token: session.session.token,
  })
}
