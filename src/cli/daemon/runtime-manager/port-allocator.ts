/**
 * Deterministic health-port allocator. Each supervised daemon needs its own
 * `/health` port (the daemon's health server binds a single port). The
 * allocator hands out the lowest free port in `[base, max)` and recycles ports
 * when a workspace is torn down — keeping the range bounded for large fleets.
 */
export class PortAllocator {
  private readonly base: number;
  private readonly max: number;
  private readonly used = new Map<string, number>();
  private readonly taken = new Set<number>();

  constructor(base: number, max: number) {
    if (max <= base) {
      throw new Error(`invalid port range: base=${base} max=${max}`);
    }
    this.base = base;
    this.max = max;
  }

  /** Allocate (or return the existing) port for a workspace. */
  allocate(workspaceId: string): number {
    const existing = this.used.get(workspaceId);
    if (existing !== undefined) return existing;

    for (let port = this.base; port < this.max; port++) {
      if (!this.taken.has(port)) {
        this.taken.add(port);
        this.used.set(workspaceId, port);
        return port;
      }
    }
    throw new Error(
      `health port range exhausted (${this.base}-${this.max}); increase ALOOK_RM_HEALTH_PORT_MAX`,
    );
  }

  /** Release a workspace's port so it can be reused. */
  release(workspaceId: string): void {
    const port = this.used.get(workspaceId);
    if (port === undefined) return;
    this.used.delete(workspaceId);
    this.taken.delete(port);
  }

  /** Current port for a workspace, or undefined if not allocated. */
  portFor(workspaceId: string): number | undefined {
    return this.used.get(workspaceId);
  }

  get size(): number {
    return this.used.size;
  }
}
