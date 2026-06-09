import { mkdirSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { join } from "path";
import { createLogger, type Logger } from "../../lib/logger.js";
import { computeBackoffDelay, DEFAULT_BACKOFF } from "./backoff.js";
import type {
  BackoffConfig,
  HealthEvaluation,
  SupervisedSnapshot,
  SupervisedState,
} from "./types.js";

export interface ChildLike {
  pid?: number;
  stdout?: { on(event: "data", cb: (chunk: unknown) => void): unknown } | null;
  stderr?: { on(event: "data", cb: (chunk: unknown) => void): unknown } | null;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnFn = (
  command: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv;
    stdio: Array<"ignore" | "pipe" | "inherit">;
    detached?: boolean;
  },
) => ChildLike;

export type FetchFn = typeof fetch;
type TimerHandle = ReturnType<typeof setTimeout>;

export interface SupervisedDaemonOptions {
  workspaceId: string;
  token: string;
  provider: string;
  serverUrl: string;
  /** Isolated state root for this workspace (becomes ALOOK_PROJECT_ROOT). */
  projectRoot: string;
  healthPort: number;
  backoff?: BackoffConfig;
  unhealthyThreshold?: number;
  // Injected dependencies (defaults wire to the real runtime).
  spawnFn?: SpawnFn;
  fetchFn?: FetchFn;
  prepareFn?: (opts: PrepareContext) => void;
  setTimeoutFn?: (cb: () => void, ms: number) => TimerHandle;
  clearTimeoutFn?: (t: TimerHandle) => void;
  logger?: Logger;
  now?: () => number;
  execPath?: string;
  cliEntry?: string;
}

export interface PrepareContext {
  projectRoot: string;
  workspaceId: string;
  token: string;
  serverUrl: string;
}

/**
 * Write the isolated daemon config for a managed workspace. The daemon reads
 * `<ALOOK_PROJECT_ROOT>/config.json`; we seed it with a single active watched
 * workspace bound to the provisioned machine token.
 */
export function writeManagedDaemonConfig(ctx: PrepareContext): void {
  mkdirSync(ctx.projectRoot, { recursive: true, mode: 0o700 });
  const config = {
    server_url: ctx.serverUrl,
    watched_workspaces: [
      {
        id: ctx.workspaceId,
        name: ctx.workspaceId,
        token: ctx.token,
        status: "active" as const,
        agent_ids: [] as string[],
      },
    ],
  };
  writeFileSync(join(ctx.projectRoot, "config.json"), JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Evaluate a raw `/health` body into a healthy/unhealthy decision. Pure — unit
 * tested directly.
 */
export function evaluateHealth(body: unknown): HealthEvaluation {
  if (!body || typeof body !== "object") {
    return { healthy: false, reason: "malformed health body", runtimes: 0 };
  }
  const b = body as Record<string, unknown>;
  const runtimes = typeof b.runtimes === "number" ? b.runtimes : 0;
  if (b.status !== "ok") {
    return { healthy: false, reason: `status=${String(b.status)}`, runtimes };
  }
  return { healthy: true, reason: "ok", runtimes };
}

/**
 * Supervises exactly one isolated managed daemon for a workspace: spawn,
 * crash-restart with exponential backoff, periodic health probing, structured
 * logging and clean shutdown. All side-effecting collaborators are injectable
 * so the full lifecycle is unit-testable without real processes or sockets.
 */
export class SupervisedDaemon {
  readonly workspaceId: string;
  readonly healthPort: number;

  private readonly token: string;
  private readonly provider: string;
  private readonly serverUrl: string;
  private readonly projectRoot: string;
  private readonly backoff: BackoffConfig;
  private readonly unhealthyThreshold: number;

  private readonly spawnFn: SpawnFn;
  private readonly fetchFn: FetchFn;
  private readonly prepareFn: (ctx: PrepareContext) => void;
  private readonly setTimeoutFn: (cb: () => void, ms: number) => TimerHandle;
  private readonly clearTimeoutFn: (t: TimerHandle) => void;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly execPath: string;
  private readonly cliEntry: string;

  private state: SupervisedState = "idle";
  private child: ChildLike | null = null;
  private restarts = 0;
  private consecutiveHealthFailures = 0;
  private lastError: string | null = null;
  private lastHealthyAt: string | null = null;
  private restartTimer: TimerHandle | null = null;
  private stopped = false;

  constructor(opts: SupervisedDaemonOptions) {
    this.workspaceId = opts.workspaceId;
    this.token = opts.token;
    this.provider = opts.provider;
    this.serverUrl = opts.serverUrl;
    this.projectRoot = opts.projectRoot;
    this.healthPort = opts.healthPort;
    this.backoff = opts.backoff ?? DEFAULT_BACKOFF;
    this.unhealthyThreshold = opts.unhealthyThreshold ?? 3;

    this.spawnFn = opts.spawnFn ?? defaultSpawn;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.prepareFn = opts.prepareFn ?? writeManagedDaemonConfig;
    this.setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((t) => clearTimeout(t));
    this.log = opts.logger ?? createLogger({ module: `rt:${opts.workspaceId}` });
    this.now = opts.now ?? (() => Date.now());
    this.execPath = opts.execPath ?? process.execPath;
    this.cliEntry = opts.cliEntry ?? process.argv[1] ?? "";
  }

  getState(): SupervisedState {
    return this.state;
  }

  /** Build the child environment with full per-workspace isolation. */
  buildEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ALOOK_PROJECT_ROOT: this.projectRoot,
      ALOOK_WORKSPACES_ROOT: join(this.projectRoot, "workspaces"),
      ALOOK_DAEMON_ID: `managed_${this.workspaceId}`,
      ALOOK_HEALTH_PORT: String(this.healthPort),
      ALOOK_RUNTIME_MODE: "managed",
      ALOOK_SERVER_URL: this.serverUrl,
    };
  }

  /** Start (or restart) the supervised daemon. */
  start(): void {
    if (this.stopped) return;
    if (this.state === "running" || this.state === "starting") return;

    this.state = "starting";
    try {
      this.prepareFn({
        projectRoot: this.projectRoot,
        workspaceId: this.workspaceId,
        token: this.token,
        serverUrl: this.serverUrl,
      });
    } catch (e) {
      this.lastError = `prepare failed: ${errMsg(e)}`;
      this.log.error(`workspace ${this.workspaceId}: ${this.lastError}`);
      this.scheduleRestart();
      return;
    }

    const args = [this.cliEntry, "daemon", "start", "--foreground"];
    let child: ChildLike;
    try {
      child = this.spawnFn(this.execPath, args, {
        env: this.buildEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      this.lastError = `spawn failed: ${errMsg(e)}`;
      this.log.error(`workspace ${this.workspaceId}: ${this.lastError}`);
      this.scheduleRestart();
      return;
    }

    this.child = child;
    this.state = "running";
    this.log.info(
      `workspace ${this.workspaceId}: daemon started (pid=${child.pid ?? "?"}, port=${this.healthPort}, provider=${this.provider})`,
    );

    this.pipeLogs(child);

    child.on("exit", (...a: unknown[]) => this.handleExit(a[0] as number | null));
  }

  private pipeLogs(child: ChildLike): void {
    const forward = (level: "info" | "error") => (chunk: unknown) => {
      const text = String(chunk).trimEnd();
      if (text) this.log[level](`[${this.workspaceId}] ${text}`);
    };
    child.stdout?.on("data", forward("info"));
    child.stderr?.on("data", forward("error"));
  }

  private handleExit(code: number | null): void {
    this.child = null;
    if (this.stopped || this.state === "stopping") {
      this.state = "stopped";
      this.log.info(`workspace ${this.workspaceId}: daemon stopped`);
      return;
    }
    this.lastError = `daemon exited code=${code ?? "null"}`;
    this.log.warn(`workspace ${this.workspaceId}: ${this.lastError}`);
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.stopped) return;
    this.restarts += 1;
    const delay = computeBackoffDelay(this.restarts, this.backoff);
    this.state = "backoff";
    this.log.warn(
      `workspace ${this.workspaceId}: restart in ${delay}ms (attempt ${this.restarts})`,
    );
    this.restartTimer = this.setTimeoutFn(() => {
      this.restartTimer = null;
      this.start();
    }, delay);
  }

  /**
   * Probe the daemon's health endpoint. On `unhealthyThreshold` consecutive
   * failures while running, the child is killed so the exit handler restarts it
   * with backoff. A success resets both failure and restart counters.
   */
  async probeHealth(): Promise<HealthEvaluation> {
    if (this.state !== "running" || !this.child) {
      return { healthy: false, reason: `state=${this.state}`, runtimes: 0 };
    }
    let evaluation: HealthEvaluation;
    try {
      const res = await this.fetchFn(`http://127.0.0.1:${this.healthPort}/health`);
      if (!res.ok) {
        evaluation = { healthy: false, reason: `HTTP ${res.status}`, runtimes: 0 };
      } else {
        evaluation = evaluateHealth(await res.json());
      }
    } catch (e) {
      evaluation = { healthy: false, reason: errMsg(e), runtimes: 0 };
    }

    if (evaluation.healthy) {
      this.consecutiveHealthFailures = 0;
      this.restarts = 0;
      this.lastHealthyAt = new Date(this.now()).toISOString();
      return evaluation;
    }

    this.consecutiveHealthFailures += 1;
    this.log.warn(
      `workspace ${this.workspaceId}: unhealthy (${evaluation.reason}) ${this.consecutiveHealthFailures}/${this.unhealthyThreshold}`,
    );
    if (this.consecutiveHealthFailures >= this.unhealthyThreshold) {
      this.log.error(
        `workspace ${this.workspaceId}: health threshold exceeded — recycling daemon`,
      );
      this.consecutiveHealthFailures = 0;
      this.recycle();
    }
    return evaluation;
  }

  /** Kill the current child without marking the supervisor stopped. */
  private recycle(): void {
    const child = this.child;
    if (!child) return;
    try {
      child.kill("SIGTERM");
    } catch {
      // exit handler will still fire and schedule the restart
    }
  }

  /** Stop the daemon permanently (graceful) and cancel any pending restart. */
  stop(): void {
    this.stopped = true;
    if (this.restartTimer) {
      this.clearTimeoutFn(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child) {
      this.state = "stopping";
      try {
        this.child.kill("SIGTERM");
      } catch {
        this.state = "stopped";
      }
    } else {
      this.state = "stopped";
    }
  }

  snapshot(): SupervisedSnapshot {
    return {
      workspaceId: this.workspaceId,
      state: this.state,
      pid: this.child?.pid ?? null,
      healthPort: this.healthPort,
      restarts: this.restarts,
      lastError: this.lastError,
      lastHealthyAt: this.lastHealthyAt,
    };
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const defaultSpawn: SpawnFn = (command, args, options) =>
  spawn(command, args, options) as unknown as ChildLike;
