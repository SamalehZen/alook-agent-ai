import { execSync } from "child_process"
import { resolve } from "path"

const WEB_DIR = resolve(import.meta.dirname, "../../..")
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 500

function execWithRetry(cmd: string): string {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return execSync(cmd, { cwd: WEB_DIR, stdio: "pipe" }).toString()
    } catch (e) {
      const msg = (e as Error).message || ""
      if (attempt < MAX_RETRIES && msg.includes("SQLITE_BUSY")) {
        execSync(`sleep ${RETRY_DELAY_MS / 1000}`)
        continue
      }
      throw e
    }
  }
  throw new Error("unreachable")
}

/**
 * Execute a SQL command against the local D1 database via wrangler.
 */
export function sql(query: string): string {
  const escaped = query.replace(/"/g, '\\"')
  return execWithRetry(
    `npx wrangler d1 execute alook-app --local --command "${escaped}"`,
  )
}

/**
 * Execute SQL and parse the JSON result.
 */
export function sqlQuery<T = Record<string, unknown>>(query: string): T[] {
  const escaped = query.replace(/"/g, '\\"')
  const raw = execWithRetry(
    `npx wrangler d1 execute alook-app --local --json --command "${escaped}"`,
  )
  const parsed = JSON.parse(raw)
  return parsed[0]?.results ?? []
}
