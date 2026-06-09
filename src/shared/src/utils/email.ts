function domain() {
  return `@${process.env.NEXT_PUBLIC_ALOOK_DOMAIN || process.env.ALOOK_DOMAIN || "alook.ai"}`
}
const HANDLE_RE = /^[a-zA-Z0-9-]{3,}$/

const RESERVED_HANDLES = new Set([
  "no-reply",
  "noreply",
  "admin",
  "support",
  "help",
  "info",
  "postmaster",
  "abuse",
  "security",
  "mailer-daemon",
  "root",
  "webmaster",
  "hostmaster",
  "system",
  "alook",
])

export function parseEmailHandle(a: string) { const d = domain(); return a.endsWith(d) ? a.slice(0, -d.length) : "" }
export function toAlookAddress(h: string) { return `${h}${domain()}` }
export function isValidHandle(h: string) { return HANDLE_RE.test(h) && !RESERVED_HANDLES.has(h.toLowerCase()) }
