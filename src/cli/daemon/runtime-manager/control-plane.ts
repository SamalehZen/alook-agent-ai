import type { ManagedRuntimeInfo } from "./types.js";

export type FetchFn = typeof fetch;

export interface ControlPlaneOptions {
  baseUrl: string;
  secret: string;
  fetchFn?: FetchFn;
  /** Max retries for transient/network failures (per request). */
  maxRetries?: number;
  /** Base delay between retries in ms. */
  retryDelayMs?: number;
}

interface RawManagedRuntime {
  id?: unknown;
  workspaceId?: unknown;
  daemonId?: unknown;
  provider?: unknown;
  runtimeMode?: unknown;
  machineLastSeenAt?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Typed client for the web runtime-manager control-plane endpoints. All
 * requests carry the shared `X-Runtime-Manager-Secret`. Network-level failures
 * are retried with a short fixed backoff; HTTP error responses are surfaced.
 */
export class ControlPlaneClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly fetchFn: FetchFn;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(opts: ControlPlaneOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.secret = opts.secret;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 500;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-Runtime-Manager-Secret": this.secret,
    };
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchFn(this.baseUrl + path, {
          method,
          headers: this.headers(),
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        if (res.status === 204) return undefined;
        return await res.json();
      } catch (e) {
        // Retry only network-level errors (TypeError from fetch); HTTP errors
        // (which carry a status) are deterministic and surfaced immediately.
        const isNetwork = e instanceof TypeError;
        if (isNetwork && attempt < this.maxRetries) {
          lastError = e;
          await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** attempt));
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  /** List all managed runtimes the control plane wants online. */
  async listManagedRuntimes(): Promise<ManagedRuntimeInfo[]> {
    const raw = await this.request("GET", "/api/runtime-manager/managed-runtimes");
    const runtimes = (raw as { runtimes?: unknown })?.runtimes;
    if (!Array.isArray(runtimes)) return [];
    return runtimes
      .map((r): ManagedRuntimeInfo => {
        const row = r as RawManagedRuntime;
        return {
          id: str(row.id),
          workspaceId: str(row.workspaceId),
          daemonId: str(row.daemonId),
          provider: str(row.provider) || "opencode",
          runtimeMode: str(row.runtimeMode) || "managed",
          machineLastSeenAt:
            typeof row.machineLastSeenAt === "string" ? row.machineLastSeenAt : null,
        };
      })
      .filter((r) => r.workspaceId.length > 0);
  }

  /** Provision (idempotently) a machine token for a workspace's managed runtime. */
  async provisionToken(workspaceId: string): Promise<string> {
    const raw = await this.request("POST", "/api/runtime-manager/provision", {
      workspace_id: workspaceId,
    });
    const token = (raw as { token?: unknown })?.token;
    if (typeof token !== "string" || token.length === 0) {
      throw new Error(`provision returned no token for workspace ${workspaceId}`);
    }
    return token;
  }
}
