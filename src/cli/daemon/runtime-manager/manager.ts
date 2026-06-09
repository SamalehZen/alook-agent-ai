import { join } from "path";
import { createLogger, type Logger } from "../../lib/logger.js";
import { ControlPlaneClient } from "./control-plane.js";
import { PortAllocator } from "./port-allocator.js";
import { SupervisedDaemon, type SupervisedDaemonOptions } from "./supervised-daemon.js";
import type {
  HealthEvaluation,
  ManagedRuntimeInfo,
  RuntimeManagerConfig,
  SupervisedSnapshot,
  SupervisedState,
} from "./types.js";

/** Minimal surface of a supervised daemon the manager depends on. */
export interface SupervisedLike {
  readonly workspaceId: string;
  start(): void;
  stop(): void;
  probeHealth(): Promise<HealthEvaluation>;
  snapshot(): SupervisedSnapshot;
  getState(): SupervisedState;
}

export type DaemonFactory = (opts: SupervisedDaemonOptions) => SupervisedLike;

export interface RuntimeManagerDeps {
  config: RuntimeManagerConfig;
  controlPlane?: ControlPlaneClient;
  daemonFactory?: DaemonFactory;
  logger?: Logger;
  setIntervalFn?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (t: ReturnType<typeof setInterval>) => void;
}

/**
 * The Runtime Manager: an operator-run control loop that keeps the host's set
 * of supervised managed daemons in sync with the control plane's desired set.
 * It provisions tokens, boots one isolated daemon per workspace, sweeps health,
 * and tears down runtimes that are no longer wanted — with zero user action.
 */
export class RuntimeManager {
  private readonly config: RuntimeManagerConfig;
  private readonly controlPlane: ControlPlaneClient;
  private readonly daemonFactory: DaemonFactory;
  private readonly log: Logger;
  private readonly ports: PortAllocator;
  private readonly supervised = new Map<string, SupervisedLike>();
  private readonly setIntervalFn: (cb: () => void, ms: number) => ReturnType<typeof setInterval>;
  private readonly clearIntervalFn: (t: ReturnType<typeof setInterval>) => void;

  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private reconciling = false;
  private sweeping = false;
  private started = false;

  constructor(deps: RuntimeManagerDeps) {
    this.config = deps.config;
    this.controlPlane =
      deps.controlPlane ??
      new ControlPlaneClient({
        baseUrl: deps.config.serverUrl,
        secret: deps.config.secret,
      });
    this.log = deps.logger ?? createLogger({ module: "runtime-manager" });
    this.daemonFactory =
      deps.daemonFactory ?? ((opts) => new SupervisedDaemon(opts));
    this.ports = new PortAllocator(
      deps.config.healthPortBase,
      deps.config.healthPortMax,
    );
    this.setIntervalFn = deps.setIntervalFn ?? ((cb, ms) => setInterval(cb, ms));
    this.clearIntervalFn = deps.clearIntervalFn ?? ((t) => clearInterval(t));
  }

  /** Start the reconcile + health loops (idempotent). */
  async start(): Promise<void> {
    if (this.started) return;
    if (!this.config.secret) {
      throw new Error(
        "runtime-manager: missing secret (set ALOOK_RUNTIME_MANAGER_SECRET)",
      );
    }
    this.started = true;
    this.log.info(
      `runtime-manager online — server=${this.config.serverUrl} reconcile=${this.config.reconcileIntervalMs}ms health=${this.config.healthIntervalMs}ms`,
    );
    await this.reconcileOnce();
    this.reconcileTimer = this.setIntervalFn(
      () => void this.reconcileOnce(),
      this.config.reconcileIntervalMs,
    );
    this.healthTimer = this.setIntervalFn(
      () => void this.healthSweep(),
      this.config.healthIntervalMs,
    );
  }

  /** Diff desired (control plane) vs actual (supervised) and converge. */
  async reconcileOnce(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      let desired: ManagedRuntimeInfo[];
      try {
        desired = await this.controlPlane.listManagedRuntimes();
      } catch (e) {
        this.log.error(`reconcile: failed to list managed runtimes: ${errMsg(e)}`);
        return;
      }

      // Dedupe by workspace — one isolated daemon serves all of a workspace's
      // managed providers.
      const desiredByWs = new Map<string, ManagedRuntimeInfo>();
      for (const rt of desired) {
        if (!desiredByWs.has(rt.workspaceId)) desiredByWs.set(rt.workspaceId, rt);
      }

      this.log.info(
        `reconcile: ${this.supervised.size} supervised, ${desiredByWs.size} desired`,
      );

      // Start newly-desired workspaces.
      for (const [workspaceId, info] of desiredByWs) {
        if (this.supervised.has(workspaceId)) continue;
        await this.startWorkspace(workspaceId, info);
      }

      // Stop workspaces no longer desired.
      for (const workspaceId of [...this.supervised.keys()]) {
        if (!desiredByWs.has(workspaceId)) {
          this.stopWorkspace(workspaceId);
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  private async startWorkspace(
    workspaceId: string,
    info: ManagedRuntimeInfo,
  ): Promise<void> {
    let token: string;
    try {
      token = await this.controlPlane.provisionToken(workspaceId);
    } catch (e) {
      // Isolated failure — other workspaces keep converging; retried next cycle.
      this.log.error(`workspace ${workspaceId}: provisioning failed: ${errMsg(e)}`);
      return;
    }

    const healthPort = this.ports.allocate(workspaceId);
    const daemon = this.daemonFactory({
      workspaceId,
      token,
      provider: info.provider,
      serverUrl: this.config.serverUrl,
      projectRoot: join(this.config.baseDir, workspaceId),
      healthPort,
      backoff: this.config.backoff,
      unhealthyThreshold: this.config.unhealthyThreshold,
    });
    this.supervised.set(workspaceId, daemon);
    this.log.info(`workspace ${workspaceId}: provisioned — booting daemon`);
    daemon.start();
  }

  private stopWorkspace(workspaceId: string): void {
    const daemon = this.supervised.get(workspaceId);
    if (!daemon) return;
    this.log.info(`workspace ${workspaceId}: no longer desired — tearing down`);
    daemon.stop();
    this.supervised.delete(workspaceId);
    this.ports.release(workspaceId);
  }

  /** Probe every supervised daemon's health once. */
  async healthSweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await Promise.all(
        [...this.supervised.values()].map((d) =>
          d.probeHealth().catch((e) => {
            this.log.debug(`health probe error: ${errMsg(e)}`);
            return undefined;
          }),
        ),
      );
    } finally {
      this.sweeping = false;
    }
  }

  /** Snapshot of all supervised daemons (for `status`). */
  snapshots(): SupervisedSnapshot[] {
    return [...this.supervised.values()].map((d) => d.snapshot());
  }

  get size(): number {
    return this.supervised.size;
  }

  /** Stop all loops and supervised daemons. */
  stop(): void {
    if (this.reconcileTimer) this.clearIntervalFn(this.reconcileTimer);
    if (this.healthTimer) this.clearIntervalFn(this.healthTimer);
    this.reconcileTimer = null;
    this.healthTimer = null;
    for (const workspaceId of [...this.supervised.keys()]) {
      const daemon = this.supervised.get(workspaceId);
      daemon?.stop();
      this.ports.release(workspaceId);
    }
    this.supervised.clear();
    this.started = false;
    this.log.info("runtime-manager stopped");
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
