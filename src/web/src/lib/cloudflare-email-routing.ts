type CloudflareError = { code?: number; message?: string }

type CreateRuleResponse = {
  success: boolean
  errors?: CloudflareError[]
}

export async function ensureAgentEmailRoute(env: Env, handle: string): Promise<void> {
  const token = env.CLOUDFLARE_EMAIL_ROUTING_TOKEN
  const zoneId = env.CLOUDFLARE_EMAIL_ROUTING_ZONE_ID
  const domain = env.ALOOK_DOMAIN
  const workerName = env.CLOUDFLARE_EMAIL_ROUTING_WORKER || "alook-email-worker"

  if (!token || !zoneId || !domain) return

  const address = `${handle}@${domain}`
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Alook agent ${address}`,
      enabled: true,
      matchers: [{ type: "literal", field: "to", value: address }],
      actions: [{ type: "worker", value: [workerName] }],
      priority: 1,
    }),
  })

  const json = await res.json().catch(() => null) as CreateRuleResponse | null
  if (res.ok && json?.success) return

  const errors = json?.errors ?? []
  const alreadyExists = errors.some((err) => {
    const message = err.message?.toLowerCase() ?? ""
    return message.includes("already") || message.includes("duplicate")
  })
  if (alreadyExists) return

  const details = errors.map((err) => err.message).filter(Boolean).join("; ") || res.statusText
  throw new Error(`Cloudflare Email Routing rule failed for ${address}: ${details}`)
}
