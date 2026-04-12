import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { seedTestData, cleanupTestData, type TestSeed } from "../helpers/seed"
import { sessionRequest, tokenRequest } from "../helpers/auth"

let seed: TestSeed

beforeAll(() => {
  seed = seedTestData()
})
afterAll(() => cleanupTestData(seed))

describe("machine tokens", () => {
  it("GET /api/machine-tokens lists tokens (requires workspace header)", async () => {
    const res = await tokenRequest(
      `/api/machine-tokens?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
    )
    expect(res.status).toBe(200)
    const data = await res.json() as Array<Record<string, unknown>>
    expect(Array.isArray(data)).toBe(true)
    expect(data.some(t => t.id === seed.machineTokenId)).toBe(true)
  })

  it("POST /api/machine-tokens creates a new token", async () => {
    const res = await tokenRequest(
      `/api/machine-tokens?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "e2e-created" }),
      },
    )
    expect(res.status).toBe(201)
    const data = await res.json() as Record<string, unknown>
    expect(data.token).toBeTruthy()
    expect((data.token as string).startsWith("al_")).toBe(true)
    expect(data.name).toBe("e2e-created")

    // Verify the new token works for auth
    const meRes = await tokenRequest(
      `/api/machine-tokens?workspace_id=${seed.workspaceId}`,
      data.token as string,
    )
    expect(meRes.status).toBe(200)

    // Cleanup: delete the created token
    const deleteRes = await tokenRequest(
      `/api/machine-tokens/${data.id}?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      { method: "DELETE" },
    )
    expect(deleteRes.status).toBe(204)
  })

  it("DELETE /api/machine-tokens/:id removes token", async () => {
    // Create a token to delete
    const createRes = await tokenRequest(
      `/api/machine-tokens?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "to-delete" }),
      },
    )
    const { id, token: newRawToken } = await createRes.json() as { id: string; token: string }

    const deleteRes = await tokenRequest(
      `/api/machine-tokens/${id}?workspace_id=${seed.workspaceId}`,
      seed.machineToken,
      { method: "DELETE" },
    )
    expect(deleteRes.status).toBe(204)

    // Verify deleted token no longer works
    const verifyRes = await tokenRequest(
      `/api/machine-tokens?workspace_id=${seed.workspaceId}`,
      newRawToken,
    )
    expect(verifyRes.status).toBe(401)
  })
})
