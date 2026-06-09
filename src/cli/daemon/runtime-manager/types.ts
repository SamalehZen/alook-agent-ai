/**
 * Shared types for the Runtime Manager (managed-runtime supervisor).
 *
 * The Runtime Manager is an operator-run control loop that reconciles the
 * *desired* set of managed runtimes (reported by the web control plane) with
 * the *actual* set of supervised daemon processes running on the host. It owns
 * one isolated daemon per workspace and keeps it healthy.
 */

/** A managed runtime as reported by the control plane. */
export interface ManagedRuntimeInfo {
  id: string;
  workspaceId: string;
  daemonId: string;
  provider: string;
  runtimeMode: string;
  machineLastSeenAt: string | null;
}

/** Lifecycle states of a single supervised daemon. */
export type SupervisedState =
  | "idle"
  | "starting"
  | "running"
  | "backoff"
  | "stopping"
  | "stopped";

/** Parsed `/health` response from a daemon. */
export interface HealthReport {
  status: string;
  uptime: string;
  runtimes: number;
}

/** Result of evaluating a health probe. */
export interface HealthEvaluation {
  healthy: boolean;
  reason: string;
  runtimes: number;
}

/** A point-in-time snapshot of a supervised daemon (for status output). */
export interface SupervisedSnapshot {
  workspaceId: string;
  state: SupervisedState;
  pid: number | null;
  healthPort: number;
  restarts: number;
  lastError: string | null;
  lastHealthyAt: string | null;
}

export interface BackoffConfig {
  /** First retry delay in ms. */
  baseMs: number;
  /** Multiplier applied per consecutive failure. */
  factor: number;
  /** Maximum delay in ms (cap). */
  maxMs: number;
  /** Jitter ratio in [0,1]; 0 disables jitter. */
  jitter: number;
}

export interface RuntimeManagerConfig {
  /** Base URL of the Alook web control plane. */
  serverUrl: string;
  /** Shared secret sent as `X-Runtime-Manager-Secret`. */
  secret: string;
  /** How often to reconcile desired vs actual, in ms. */
  reconcileIntervalMs: number;
  /** How often to probe daemon health, in ms. */
  healthIntervalMs: number;
  /** Number of consecutive failed probes before a daemon is restarted. */
  unhealthyThreshold: number;
  /** Root directory under which per-workspace isolated state lives. */
  baseDir: string;
  /** First health port to allocate; subsequent workspaces get +1, +2, … */
  healthPortBase: number;
  /** Upper bound (exclusive) for health port allocation. */
  healthPortMax: number;
  /** Restart backoff configuration. */
  backoff: BackoffConfig;
}
