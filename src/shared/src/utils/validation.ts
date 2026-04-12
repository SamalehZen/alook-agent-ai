const PREFIX = "alook_tk_"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidToken(k: string) { return k.startsWith(PREFIX) && k.slice(PREFIX.length).length >= 12 }
export function isValidEmail(e: string) { return EMAIL_RE.test(e) }
