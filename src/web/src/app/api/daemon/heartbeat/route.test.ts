import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Shared mock fns -- wired fresh on each test via vi.doMock
// ---------------------------------------------------------------------------
const mockGetAgentRuntimeForWorkspace = vi.fn();
const mockUpdateAgentRuntimeHeartbeat = vi.fn();
const mockMarkStaleRuntimesOffline = vi.fn();
const mockFailStaleDispatchedTasks = vi.fn();
const mockReconcileAgentStatus = vi.fn();

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/daemon/heartbeat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/daemon/heartbeat", () => {
  beforeEach(() => vi.clearAllMocks());

  async function loadRoute(authCtx: Record<string, unknown>) {
    vi.resetModules();

    const { HeartbeatRequestSchema } = await import("@alook/shared");

    vi.doMock("@opennextjs/cloudflare", () => ({
      getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
    }));
    vi.doMock("@alook/shared", () => ({
      createDb: vi.fn(() => ({})),
      queries: {
        runtime: {
          getAgentRuntimeForWorkspace: (...a: any[]) =>
            mockGetAgentRuntimeForWorkspace(...a),
          updateAgentRuntimeHeartbeat: (...a: any[]) =>
            mockUpdateAgentRuntimeHeartbeat(...a),
          markStaleRuntimesOffline: (...a: any[]) =>
            mockMarkStaleRuntimesOffline(...a),
        },
        task: {
          failStaleDispatchedTasks: (...a: any[]) =>
            mockFailStaleDispatchedTasks(...a),
        },
      },
      HeartbeatRequestSchema,
    }));
    vi.doMock("@/lib/services/task", () => {
      const MockTaskService = function (this: any) {
        this.reconcileAgentStatus = (...a: any[]) =>
          mockReconcileAgentStatus(...a);
      } as any;
      return { TaskService: MockTaskService };
    });
    vi.doMock("@/lib/middleware/auth", () => ({
      withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
        const params =
          ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
        return handler(req, { ...authCtx, params });
      }),
    }));
    vi.doMock("@/lib/middleware/helpers", async () => {
      return await vi.importActual<typeof import("@/lib/middleware/helpers")>(
        "@/lib/middleware/helpers"
      );
    });

    const { POST } = await import("./route");
    return POST;
  }

  const daemonAuth = { userId: "u1", email: "u@t.com", workspaceId: "w1" };
  const jwtAuth = { userId: "u1", email: "u@t.com" }; // no workspaceId

  it("succeeds for runtime in caller's workspace", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace.mockResolvedValue({ id: "rt1" });
    mockUpdateAgentRuntimeHeartbeat.mockResolvedValue(undefined);
    mockMarkStaleRuntimesOffline.mockResolvedValue(undefined);
    mockFailStaleDispatchedTasks.mockResolvedValue([]);

    const res = await POST(makeReq({ runtime_id: "rt1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });

  it("returns 404 when runtime not in caller's workspace", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace.mockResolvedValue(null);

    const res = await POST(makeReq({ runtime_id: "rt-other" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Runtime not found");
  });

  it("returns 404 when runtime ID doesn't exist", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace.mockResolvedValue(null);

    const res = await POST(makeReq({ runtime_id: "nonexistent" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Runtime not found");
  });

  it("returns 403 when called without workspaceId (JWT auth)", async () => {
    const POST = await loadRoute(jwtAuth);

    const res = await POST(makeReq({ runtime_id: "rt1" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain("machine token required");
  });

  it("does NOT call heartbeat/stale functions when ownership fails", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace.mockResolvedValue(null);

    await POST(makeReq({ runtime_id: "rt1" }));

    expect(mockUpdateAgentRuntimeHeartbeat).not.toHaveBeenCalled();
    expect(mockMarkStaleRuntimesOffline).not.toHaveBeenCalled();
    expect(mockFailStaleDispatchedTasks).not.toHaveBeenCalled();
  });

  it("calls markStaleRuntimesOffline with workspaceId", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace.mockResolvedValue({ id: "rt1" });
    mockUpdateAgentRuntimeHeartbeat.mockResolvedValue(undefined);
    mockMarkStaleRuntimesOffline.mockResolvedValue(undefined);
    mockFailStaleDispatchedTasks.mockResolvedValue([]);

    await POST(makeReq({ runtime_id: "rt1" }));

    expect(mockMarkStaleRuntimesOffline).toHaveBeenCalledWith({}, "w1");
  });

  it("calls updateAgentRuntimeHeartbeat before markStaleRuntimesOffline", async () => {
    const POST = await loadRoute(daemonAuth);

    const callOrder: string[] = [];
    mockGetAgentRuntimeForWorkspace.mockResolvedValue({ id: "rt1" });
    mockUpdateAgentRuntimeHeartbeat.mockImplementation(async () => {
      callOrder.push("heartbeat");
    });
    mockMarkStaleRuntimesOffline.mockImplementation(async () => {
      callOrder.push("stale");
    });
    mockFailStaleDispatchedTasks.mockResolvedValue([]);

    await POST(makeReq({ runtime_id: "rt1" }));

    expect(callOrder).toEqual(["heartbeat", "stale"]);
  });

  it("calls failStaleDispatchedTasks and reconcile on happy path", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace.mockResolvedValue({ id: "rt1" });
    mockUpdateAgentRuntimeHeartbeat.mockResolvedValue(undefined);
    mockMarkStaleRuntimesOffline.mockResolvedValue(undefined);
    mockFailStaleDispatchedTasks.mockResolvedValue([
      { agentId: "a1" },
      { agentId: "a2" },
      { agentId: "a1" },
    ]);

    await POST(makeReq({ runtime_id: "rt1" }));

    expect(mockFailStaleDispatchedTasks).toHaveBeenCalledOnce();
    // reconcile called for each unique agentId (a1 and a2)
    expect(mockReconcileAgentStatus).toHaveBeenCalledTimes(2);
    expect(mockReconcileAgentStatus).toHaveBeenCalledWith("a1");
    expect(mockReconcileAgentStatus).toHaveBeenCalledWith("a2");
  });
});
