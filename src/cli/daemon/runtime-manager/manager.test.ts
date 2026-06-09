import { describe, it, expect, vi } from "vitest";
import { RuntimeManager, type SupervisedLike } from "./manager.js";
import type { ControlPlaneClient } from "./control-plane.js";
import { createLogger } from "../../lib/logger.js";
import type {
  HealthEvaluation,
  ManagedRuntimeInfo,
  RuntimeManagerConfig,
  SupervisedSnapshot,
} from "./types.js";

const silent = createLogger({ level: "silent" });

function cfg(overrides: Partial<RuntimeManagerConfig> = {}): RuntimeManagerConfig {
  return {
    serverUrl: "https://srv.example.com",
    secret: "s3cr3t",
    reconcileIntervalMs: 15_000,
    healthIntervalMs: 30_000,
    unhealthyThreshold: 3,
    baseDir: "/var/lib/alook/managed",
    healthPortBase: 19600,
    healthPortMax: 19700,
    backoff: { baseMs: 1000, factor: 2, maxMs: 60_000, jitter: 0 },
    ...overrides,
  };
}

function rt(workspaceId: string, provider = "opencode"): ManagedRuntimeInfo {
  return {
    id: `rt_${workspaceId}`,
    workspaceId,
    daemonId: `managed_${workspaceId}`,
    provider,
    runtimeMode: "managed",
    machineLastSeenAt: null,
  };
}

class FakeSupervised implements SupervisedLike {
  start = vi.fn();
  stop = vi.fn();
  probeHealth = vi.fn(
    async (): Promise<HealthEvaluation> => ({ healthy: true, reason: "ok", runtimes: 1 }),
  );
  constructor(public readonly workspaceId: string, public readonly opts: unknown) {}
  snapshot(): SupervisedSnapshot {
    return {
      workspaceId: this.workspaceId,
      state: "running",
      pid: 1,
      healthPort: 19600,
      restarts: 0,
      lastError: null,
      lastHealthyAt: null,
    };
  }
  getState() {
    return "running" as const;
  }
}

function fakeControlPlane(opts: {
  desired: ManagedRuntimeInfo[] | (() => ManagedRuntimeInfo[]);
  provision?: (ws: string) => Promise<string>;
}) {
  const listManagedRuntimes = vi.fn(async () =>
    typeof opts.desired === "function" ? opts.desired() : opts.desired,
  );
  const provisionToken = vi.fn(
    opts.provision ?? (async (ws: string) => `token_${ws}`),
  );
  return {
    cp: { listManagedRuntimes, provisionToken } as unknown as ControlPlaneClient,
    listManagedRuntimes,
    provisionToken,
  };
}

function build(
  cp: ControlPlaneClient,
  config = cfg(),
): { manager: RuntimeManager; created: FakeSupervised[] } {
  const created: FakeSupervised[] = [];
  const manager = new RuntimeManager({
    config,
    controlPlane: cp,
    logger: silent,
    daemonFactory: (o) => {
      const fake = new FakeSupervised(o.workspaceId, o);
      created.push(fake);
      return fake;
    },
  });
  return { manager, created };
}

describe("RuntimeManager.reconcileOnce", () => {
  it("provisions and starts a daemon per desired workspace", async () => {
    const { cp, provisionToken } = fakeControlPlane({ desired: [rt("ws1"), rt("ws2")] });
    const { manager, created } = build(cp);

    await manager.reconcileOnce();

    expect(manager.size).toBe(2);
    expect(provisionToken).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(2);
    for (const fake of created) {
      expect(fake.start).toHaveBeenCalledOnce();
    }
    const o = created[0].opts as { projectRoot: string; token: string; healthPort: number; serverUrl: string };
    expect(o.projectRoot).toBe("/var/lib/alook/managed/ws1");
    expect(o.token).toBe("token_ws1");
    expect(o.healthPort).toBe(19600);
    expect(o.serverUrl).toBe("https://srv.example.com");
    expect((created[1].opts as { healthPort: number }).healthPort).toBe(19601);
  });

  it("dedupes multiple managed runtimes for the same workspace", async () => {
    const { cp } = fakeControlPlane({ desired: [rt("ws1", "opencode"), rt("ws1", "claude")] });
    const { manager, created } = build(cp);
    await manager.reconcileOnce();
    expect(manager.size).toBe(1);
    expect(created).toHaveLength(1);
  });

  it("is idempotent across reconciles for stable desired set", async () => {
    const { cp } = fakeControlPlane({ desired: [rt("ws1")] });
    const { manager, created } = build(cp);
    await manager.reconcileOnce();
    await manager.reconcileOnce();
    expect(created).toHaveLength(1);
    expect(created[0].start).toHaveBeenCalledOnce();
  });

  it("tears down daemons that are no longer desired and recycles the port", async () => {
    let desired = [rt("ws1"), rt("ws2")];
    const { cp } = fakeControlPlane({ desired: () => desired });
    const { manager, created } = build(cp);

    await manager.reconcileOnce();
    expect(manager.size).toBe(2);

    desired = [rt("ws2")];
    await manager.reconcileOnce();

    expect(manager.size).toBe(1);
    const ws1 = created.find((c) => c.workspaceId === "ws1")!;
    expect(ws1.stop).toHaveBeenCalledOnce();

    // ws1's port (19600) should be recycled for a brand-new workspace.
    desired = [rt("ws2"), rt("ws3")];
    await manager.reconcileOnce();
    const ws3 = created.find((c) => c.workspaceId === "ws3")!;
    expect((ws3.opts as { healthPort: number }).healthPort).toBe(19600);
  });

  it("isolates provisioning failures to the affected workspace", async () => {
    let badAttempts = 0;
    const { cp } = fakeControlPlane({
      desired: [rt("bad"), rt("good")],
      provision: async (ws) => {
        if (ws === "bad" && badAttempts++ === 0) throw new Error("boom");
        return `token_${ws}`;
      },
    });
    const { manager, created } = build(cp);

    await manager.reconcileOnce();

    expect(manager.size).toBe(1);
    expect(created).toHaveLength(1);
    expect(created[0].workspaceId).toBe("good");

    // Retried on the next cycle — provisioning recovered.
    await manager.reconcileOnce();
    expect(manager.size).toBe(2);
  });

  it("survives a control-plane list error without throwing", async () => {
    const listManagedRuntimes = vi.fn(async () => {
      throw new Error("503");
    });
    const cp = { listManagedRuntimes, provisionToken: vi.fn() } as unknown as ControlPlaneClient;
    const { manager } = build(cp);
    await expect(manager.reconcileOnce()).resolves.toBeUndefined();
    expect(manager.size).toBe(0);
  });
});

describe("RuntimeManager health + lifecycle", () => {
  it("probes health on every supervised daemon", async () => {
    const { cp } = fakeControlPlane({ desired: [rt("ws1"), rt("ws2")] });
    const { manager, created } = build(cp);
    await manager.reconcileOnce();
    await manager.healthSweep();
    for (const fake of created) {
      expect(fake.probeHealth).toHaveBeenCalledOnce();
    }
  });

  it("stop() halts and clears all supervised daemons", async () => {
    const { cp } = fakeControlPlane({ desired: [rt("ws1"), rt("ws2")] });
    const { manager, created } = build(cp);
    await manager.reconcileOnce();
    manager.stop();
    expect(manager.size).toBe(0);
    for (const fake of created) {
      expect(fake.stop).toHaveBeenCalledOnce();
    }
  });

  it("start() refuses to run without a secret", async () => {
    const { cp } = fakeControlPlane({ desired: [] });
    const { manager } = build(cp, cfg({ secret: "" }));
    await expect(manager.start()).rejects.toThrow(/secret/);
  });

  it("start() runs an initial reconcile then schedules loops", async () => {
    const { cp } = fakeControlPlane({ desired: [rt("ws1")] });
    const intervals: Array<{ ms: number }> = [];
    const manager = new RuntimeManager({
      config: cfg(),
      controlPlane: cp,
      logger: silent,
      daemonFactory: (o) => new FakeSupervised(o.workspaceId, o),
      setIntervalFn: (_cb, ms) => {
        intervals.push({ ms });
        return 0 as unknown as ReturnType<typeof setInterval>;
      },
      clearIntervalFn: () => {},
    });
    await manager.start();
    expect(manager.size).toBe(1);
    expect(intervals.map((i) => i.ms)).toEqual([15_000, 30_000]);
    manager.stop();
  });
});
