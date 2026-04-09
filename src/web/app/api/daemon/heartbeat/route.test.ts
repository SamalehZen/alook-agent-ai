import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/daemon/heartbeat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function setupMocks(opts: { workspaceId?: string } = { workspaceId: "w1" }) {
  vi.resetModules();

  vi.doMock("@/lib/middleware/auth", () => ({
    withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
      const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
      return handler(req, { userId: "u1", email: "u@t.com", workspaceId: opts.workspaceId, params });
    }),
  }));
  vi.doMock("@/lib/db", () => ({ db: {} }));
  vi.doMock("@/lib/db/queries/runtime", () => ({
    updateAgentRuntimeHeartbeat: vi.fn(async () => ({ id: "rt1" })),
    getAgentRuntimeForWorkspace: vi.fn(async () => ({ id: "rt1", workspaceId: "w1" })),
    markStaleRuntimesOffline: vi.fn(async () => {}),
  }));
  vi.doMock("@/lib/db/queries/task", () => ({
    failStaleDispatchedTasks: vi.fn(async () => []),
  }));
  vi.doMock("@/lib/services/task", () => ({
    TaskService: vi.fn().mockImplementation(() => ({
      reconcileAgentStatus: vi.fn(),
    })),
  }));
}

describe("POST /api/daemon/heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("succeeds for runtime in caller's workspace", async () => {
    setupMocks();
    const { POST } = await import("./route");
    const { getAgentRuntimeForWorkspace, updateAgentRuntimeHeartbeat } =
      await import("@/lib/db/queries/runtime");

    const res = await POST(makeReq({ runtime_id: "rt1" }));
    expect(res.status).toBe(200);
    expect(getAgentRuntimeForWorkspace).toHaveBeenCalledWith({}, "rt1", "w1");
    expect(updateAgentRuntimeHeartbeat).toHaveBeenCalledWith({}, "rt1");
  });

  it("returns 404 when runtime not in caller's workspace", async () => {
    setupMocks();
    const { getAgentRuntimeForWorkspace } = await import("@/lib/db/queries/runtime");
    vi.mocked(getAgentRuntimeForWorkspace).mockResolvedValue(null as any);

    const { POST } = await import("./route");
    const res = await POST(makeReq({ runtime_id: "rt-other" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when runtime ID doesn't exist at all", async () => {
    setupMocks();
    const { getAgentRuntimeForWorkspace } = await import("@/lib/db/queries/runtime");
    vi.mocked(getAgentRuntimeForWorkspace).mockResolvedValue(null as any);

    const { POST } = await import("./route");
    const res = await POST(makeReq({ runtime_id: "nonexistent" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when called without workspaceId (JWT auth)", async () => {
    setupMocks({ workspaceId: undefined });
    const { POST } = await import("./route");
    const res = await POST(makeReq({ runtime_id: "rt1" }));
    expect(res.status).toBe(403);
  });

  it("does NOT call updateAgentRuntimeHeartbeat, markStaleRuntimesOffline, or failStaleDispatchedTasks when ownership fails", async () => {
    setupMocks();
    const { getAgentRuntimeForWorkspace, updateAgentRuntimeHeartbeat, markStaleRuntimesOffline } =
      await import("@/lib/db/queries/runtime");
    const { failStaleDispatchedTasks } = await import("@/lib/db/queries/task");
    vi.mocked(getAgentRuntimeForWorkspace).mockResolvedValue(null as any);

    const { POST } = await import("./route");
    await POST(makeReq({ runtime_id: "rt-other" }));
    expect(updateAgentRuntimeHeartbeat).not.toHaveBeenCalled();
    expect(markStaleRuntimesOffline).not.toHaveBeenCalled();
    expect(failStaleDispatchedTasks).not.toHaveBeenCalled();
  });

  it("calls markStaleRuntimesOffline with (db, workspaceId)", async () => {
    setupMocks();
    const { POST } = await import("./route");
    const { markStaleRuntimesOffline } = await import("@/lib/db/queries/runtime");

    await POST(makeReq({ runtime_id: "rt1" }));
    expect(markStaleRuntimesOffline).toHaveBeenCalledWith({}, "w1");
  });

  it("calls updateAgentRuntimeHeartbeat before markStaleRuntimesOffline", async () => {
    setupMocks();
    const { updateAgentRuntimeHeartbeat, markStaleRuntimesOffline } =
      await import("@/lib/db/queries/runtime");

    const callOrder: string[] = [];
    vi.mocked(updateAgentRuntimeHeartbeat).mockImplementation(async () => {
      callOrder.push("heartbeat");
      return { id: "rt1" } as any;
    });
    vi.mocked(markStaleRuntimesOffline).mockImplementation(async () => {
      callOrder.push("markStale");
    });

    const { POST } = await import("./route");
    await POST(makeReq({ runtime_id: "rt1" }));
    expect(callOrder).toEqual(["heartbeat", "markStale"]);
  });

  it("calls failStaleDispatchedTasks and reconcileAgentStatus on happy path", async () => {
    setupMocks();
    const { failStaleDispatchedTasks } = await import("@/lib/db/queries/task");
    const { TaskService } = await import("@/lib/services/task");

    const mockReconcile = vi.fn();
    vi.mocked(TaskService).mockImplementation(() => ({ reconcileAgentStatus: mockReconcile }) as any);
    vi.mocked(failStaleDispatchedTasks).mockResolvedValue([
      { agentId: "a1" } as any,
      { agentId: "a2" } as any,
    ]);

    const { POST } = await import("./route");
    await POST(makeReq({ runtime_id: "rt1" }));
    expect(failStaleDispatchedTasks).toHaveBeenCalled();
    expect(mockReconcile).toHaveBeenCalledWith("a1");
    expect(mockReconcile).toHaveBeenCalledWith("a2");
  });
});
