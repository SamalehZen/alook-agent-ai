import { NextRequest, NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createAuth } from "@/lib/auth"

export async function middleware(request: NextRequest) {
  const { env } = await getCloudflareContext({ async: true })
  const auth = createAuth(env as Env)
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
