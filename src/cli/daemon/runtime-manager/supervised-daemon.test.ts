import { describe, it, expect, vi } from "vitest";
import {
  SupervisedDaemon,
  evaluateHealth,
  type ChildLike,
  type SpawnFn,
  type SupervisedDaemonOptions,
} from "./supervised-daemon.js";
import { createLogger } from "../../lib/logger.js";
import type { BackoffConfig } from "./types.js";

const silent = createLogger({ level: "silent" });
const BACKOFF: BackoffConfig = { baseMs: 10, factor: 2, maxMs: 100, jitter: 0 };

class FakeChild implements ChildLike {
  pid = 4242;
  stdout = null;
  stderr = null;
  killed: string[] = [];
  private listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  on(event: string, cb: (...a: unknown[]) => void): this {
    (this.listeners[event] ||= []).push(cb);
    return this;
  }
  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed.push(String(signal));
    return true;
  }
  emit(event: string, ...args: unknown[]): void {
    (this.listeners[event] || []).forEach((cb) => cb(...args));
  }
}

interface Harness {
  daemon: SupervisedDaemon;
  spawned: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv }>;
  children: FakeChild[];
  timers: Array<{ cb: () => void; ms: number }>;
  prepare: ReturnType<typeof vi.fn>;
  setFetch: (fn: typeof fetch) => void;
  flushTimer: (i?: number) => void;
}

function harness(overrides: Partial<SupervisedDaemonOptions> = {}): Harness {
  const spawned: Harness["spawned"] = [];
  const children: FakeChild[] = [];
  const timers: Harness["timers"] = [];
  const prepare = vi.fn();
  let fetchFn: typeof fetch = (async () =>
    ({ ok: true, status: 200, json: async () => ({ status: "ok", runtimes: 3 }) }) as unknown as Response) as typeof fetch;

  const spawnFn: SpawnFn = (command, args, options) => {
    const child = new FakeChild();
    children.push(child);
    spawned.push({ command, args, env: options.env });
    return child;
  };

  const daemon = new SupervisedDaemon({
    workspaceId: "ws1",
    token: "al_token",
    provider: "opencode",
    serverUrl: "https://srv.example.com",
    projectRoot: "/tmp/managed/ws1",
    healthPort: 19600,
    backoff: BACKOFF,
    unhealthyThreshold: 2,
    logger: silent,
    spawnFn,
    prepareFn: prepare,
    fetchFn: ((...a: Parameters<typeof fetch>) => fetchFn(...a)) as typeof fetch,
    setTimeoutFn: (cb, ms) => {
      timers.push({ cb, ms });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: () => {},
    execPath: "/usr/bin/node",
    cliEntry: "/app/dist/index.js",
    ...overrides,
  });

  return {
    daemon,
    spawned,
    children,
    timers,
    prepare,
    setFetch: (fn) => {
      fetchFn = fn;
    },
    flushTimer: (i = 0) => timers[i].cb(),
  };
}

describe("evaluateHealth", () => {
  it("accepts status ok", () => {
    expect(evaluateHealth({ status: "ok", runtimes: 2 })).toEqual({
      healthy: true,
      reason: "ok",
      runtimes: 2,
    });
  });
  it("rejects non-ok status and malformed bodies", () => {
    expect(evaluateHealth({ status: "degraded" }).healthy).toBe(false);
    expect(evaluateHealth(null).healthy).toBe(false);
    expect(evaluateHealth("nope").healthy).toBe(false);
  });
});

describe("SupervisedDaemon lifecycle", () => {
  it("prepares isolated config and spawns with an isolated env", () => {
    const h = harness();
    h.daemon.start();

    expect(h.prepare).toHaveBeenCalledOnce();
    expect(h.spawned).toHaveLength(1);
    const s = h.spawned[0];
    expect(s.command).toBe("/usr/bin/node");
    expect(s.args).toEqual(["/app/dist/index.js", "daemon", "start", "--foreground"]);
    expect(s.env.ALOOK_PROJECT_ROOT).toBe("/tmp/managed/ws1");
    expect(s.env.ALOOK_DAEMON_ID).toBe("managed_ws1");
    expect(s.env.ALOOK_HEALTH_PORT).toBe("19600");
    expect(s.env.ALOOK_RUNTIME_MODE).toBe("managed");
    expect(s.env.ALOOK_SERVER_URL).toBe("https://srv.example.com");
    expect(h.daemon.getState()).toBe("running");
    expect(h.daemon.snapshot().pid).toBe(4242);
  });

  it("does not double-start while running", () => {
    const h = harness();
    h.daemon.start();
    h.daemon.start();
    expect(h.spawned).toHaveLength(1);
  });

  it("restarts with backoff on unexpected exit", () => {
    const h = harness();
    h.daemon.start();
    h.children[0].emit("exit", 1);

    expect(h.daemon.getState()).toBe("backoff");
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].ms).toBe(10); // baseMs, attempt 1
    expect(h.daemon.snapshot().restarts).toBe(1);

    h.flushTimer(0); // fire the restart
    expect(h.spawned).toHaveLength(2);
    expect(h.daemon.getState()).toBe("running");
  });

  it("grows the backoff delay across consecutive crashes", () => {
    const h = harness();
    h.daemon.start();
    h.children[0].emit("exit", 1); // attempt 1 → 10ms
    h.flushTimer(0);
    h.children[1].emit("exit", 1); // attempt 2 → 20ms
    expect(h.timers[1].ms).toBe(20);
    expect(h.daemon.snapshot().restarts).toBe(2);
  });

  it("does not restart after an intentional stop", () => {
    const h = harness();
    h.daemon.start();
    h.daemon.stop();
    expect(h.children[0].killed).toContain("SIGTERM");
    h.children[0].emit("exit", null);
    expect(h.daemon.getState()).toBe("stopped");
    expect(h.timers).toHaveLength(0);
  });

  it("resets restart counter once a health probe succeeds", async () => {
    const h = harness();
    h.daemon.start();
    h.children[0].emit("exit", 1);
    h.flushTimer(0);
    expect(h.daemon.snapshot().restarts).toBe(1);

    const ev = await h.daemon.probeHealth();
    expect(ev.healthy).toBe(true);
    expect(h.daemon.snapshot().restarts).toBe(0);
    expect(h.daemon.snapshot().lastHealthyAt).not.toBeNull();
  });

  it("recycles the daemon after consecutive unhealthy probes", async () => {
    const h = harness();
    h.setFetch((async () =>
      ({ ok: true, status: 200, json: async () => ({ status: "degraded", runtimes: 0 }) }) as unknown as Response) as typeof fetch);
    h.daemon.start();

    await h.daemon.probeHealth(); // 1/2
    expect(h.children[0].killed).toHaveLength(0);
    await h.daemon.probeHealth(); // 2/2 → recycle
    expect(h.children[0].killed).toContain("SIGTERM");
  });

  it("reports unhealthy without a running child", async () => {
    const h = harness();
    const ev = await h.daemon.probeHealth();
    expect(ev.healthy).toBe(false);
    expect(ev.reason).toMatch(/state=/);
  });
});
