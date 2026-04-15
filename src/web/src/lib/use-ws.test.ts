import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { WsMessage } from "@alook/shared"

// --- Mock WebSocket ---
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  closed = false
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }
  send(data: string) { this.sent.push(data) }
  close() { this.closed = true; this.onclose?.() }

  simulateOpen() { this.onopen?.() }
  simulateMessage(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }) }
  simulateClose() { this.onclose?.() }
}

vi.stubGlobal("WebSocket", MockWebSocket)

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

vi.stubEnv("NODE_ENV", "development")
vi.stubEnv("NEXT_PUBLIC_WS_DO_PORT", "8789")

// --- Minimal React hooks mock ---
let effectCleanup: (() => void) | null = null
let refs: Map<string, { current: unknown }> = new Map()
let refCounter = 0
let callbackMemo: Map<string, { fn: Function; deps: unknown[] }> = new Map()
let callbackCounter = 0

vi.mock("react", () => ({
  useRef: (initial: unknown) => {
    const id = `ref-${refCounter++}`
    if (!refs.has(id)) {
      refs.set(id, { current: initial })
    }
    return refs.get(id)!
  },
  useCallback: (fn: Function, deps: unknown[]) => {
    const id = `cb-${callbackCounter++}`
    const existing = callbackMemo.get(id)
    if (existing && JSON.stringify(existing.deps) === JSON.stringify(deps)) {
      return existing.fn
    }
    callbackMemo.set(id, { fn, deps })
    return fn
  },
  useEffect: (fn: () => (() => void) | void, _deps: unknown[]) => {
    const cleanup = fn()
    if (cleanup) effectCleanup = cleanup
  },
}))

function setupTokenFetch() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ token: "tok-456" }),
  })
}

function resetMockState() {
  MockWebSocket.instances = []
  mockFetch.mockReset()
  effectCleanup = null
  refs = new Map()
  refCounter = 0
  callbackMemo = new Map()
  callbackCounter = 0
}

describe("useAgentWs", () => {
  beforeEach(() => {
    resetMockState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function mountHook(agentId: string, onMessage: (msg: WsMessage) => void) {
    const mod = await import("./use-ws")
    mod.useAgentWs(agentId, onMessage)
    await vi.runAllTimersAsync()
    return mod
  }

  it("connect depends on [agentId] — changing callback does NOT create new connect", async () => {
    setupTokenFetch()

    const mod = await import("./use-ws")

    resetMockState()
    setupTokenFetch()
    refCounter = 0
    callbackCounter = 0

    mod.useAgentWs("agent-1", vi.fn())
    const firstCallbackId = Array.from(callbackMemo.keys()).find(k => k.startsWith("cb-"))
    const firstConnect = callbackMemo.get(firstCallbackId!)?.fn

    // Re-render with different callback, same agentId
    refCounter = 0
    callbackCounter = 0

    mod.useAgentWs("agent-1", vi.fn())
    const secondConnect = callbackMemo.get(firstCallbackId!)?.fn

    expect(firstConnect).toBe(secondConnect)
  })

  it("connect creates new reference when agentId changes", async () => {
    setupTokenFetch()

    const mod = await import("./use-ws")

    resetMockState()
    setupTokenFetch()
    refCounter = 0
    callbackCounter = 0

    mod.useAgentWs("agent-1", vi.fn())
    const firstCallbackId = Array.from(callbackMemo.keys()).find(k => k.startsWith("cb-"))
    const firstConnect = callbackMemo.get(firstCallbackId!)?.fn

    // Re-render with different agentId
    refCounter = 0
    callbackCounter = 0

    mod.useAgentWs("agent-2", vi.fn())
    const secondConnect = callbackMemo.get(firstCallbackId!)?.fn

    // Should be different because agentId changed
    expect(firstConnect).not.toBe(secondConnect)
  })

  it("effect cleanup nullifies wsRef and calls close — onclose skips reconnect", async () => {
    setupTokenFetch()

    const onMsg = vi.fn()
    await mountHook("agent-1", onMsg)
    await vi.runAllTimersAsync()

    const ws = MockWebSocket.instances[0]
    expect(ws).toBeDefined()

    effectCleanup?.()

    expect(ws.closed).toBe(true)

    const instanceCountBefore = MockWebSocket.instances.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(MockWebSocket.instances.length).toBe(instanceCountBefore)
  })

  it("onMessageRef dispatches to latest callback", async () => {
    setupTokenFetch()

    const cb1 = vi.fn()
    await mountHook("agent-1", cb1)
    await vi.runAllTimersAsync()

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()

    ws.simulateMessage({ type: "test", data: "hello" })
    expect(cb1).toHaveBeenCalledWith({ type: "test", data: "hello" })

    const onMessageRef = Array.from(refs.values()).find(r =>
      typeof r.current === "function"
    )
    const cb2 = vi.fn()
    if (onMessageRef) onMessageRef.current = cb2

    ws.simulateMessage({ type: "test", data: "world" })
    expect(cb2).toHaveBeenCalledWith({ type: "test", data: "world" })
    expect(cb1).toHaveBeenCalledTimes(1)
  })

  it("server-initiated close triggers reconnect with backoff", async () => {
    setupTokenFetch()

    const onMsg = vi.fn()
    await mountHook("agent-1", onMsg)
    await vi.runAllTimersAsync()

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()

    const instancesBefore = MockWebSocket.instances.length

    ws.onclose?.()

    setupTokenFetch()
    await vi.advanceTimersByTimeAsync(2000)

    expect(MockWebSocket.instances.length).toBeGreaterThan(instancesBefore)
  })

  it("failed connect does not leave orphaned timers", async () => {
    mockFetch.mockRejectedValue(new Error("network error"))

    const onMsg = vi.fn()
    await mountHook("agent-1", onMsg)
    await vi.runAllTimersAsync()

    expect(MockWebSocket.instances.length).toBe(0)
    expect(() => effectCleanup?.()).not.toThrow()
  })

  it("effect cleanup clears pending reconnect timer", async () => {
    setupTokenFetch()

    const onMsg = vi.fn()
    await mountHook("agent-1", onMsg)
    await vi.runAllTimersAsync()

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()

    const instancesBefore = MockWebSocket.instances.length
    ws.onclose?.()

    effectCleanup?.()

    setupTokenFetch()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(MockWebSocket.instances.length).toBe(instancesBefore)
  })

  it("connects to correct URL with agentId", async () => {
    setupTokenFetch()

    await mountHook("my-agent-id", vi.fn())
    await vi.runAllTimersAsync()

    const ws = MockWebSocket.instances[0]
    expect(ws).toBeDefined()
    expect(ws.url).toContain("agentId=my-agent-id")
  })
})
