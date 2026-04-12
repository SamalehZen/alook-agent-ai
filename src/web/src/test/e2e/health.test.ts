import { describe, it, expect } from "vitest"

const APP_URL = process.env.APP_URL ?? "http://localhost:8787"

describe("health check", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const res = await fetch(`${APP_URL}/api/health`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ status: "ok" })
  })
})
