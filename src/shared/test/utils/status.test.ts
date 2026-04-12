import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { isOnline, formatStatus } from "../../src/utils/status"
import { OFFLINE_THRESHOLD_MS } from "../../src/constants"
describe("isOnline", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it("true within threshold", () => { vi.setSystemTime(Date.now()); expect(isOnline(new Date(Date.now() - OFFLINE_THRESHOLD_MS + 1000).toISOString())).toBe(true) })
  it("false past threshold", () => { vi.setSystemTime(Date.now()); expect(isOnline(new Date(Date.now() - OFFLINE_THRESHOLD_MS - 1).toISOString())).toBe(false) })
  it("false for empty", () => expect(isOnline("")).toBe(false))
  it("handles D1 datetime format (no T separator)", () => {
    const now = new Date()
    const d1Format = now.toISOString().replace("T", " ").replace("Z", "").split(".")[0]
    vi.setSystemTime(now)
    expect(isOnline(d1Format)).toBe(true)
  })
})
describe("formatStatus", () => {
  it("online", () => expect(formatStatus("online")).toBe("Online"))
  it("offline", () => expect(formatStatus("offline")).toBe("Offline"))
})
