import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetAgentRuntimeForWorkspace = vi.fn();
const mockSetAgentRuntimeOffline = vi.fn();

function sharedMocks() {
  return {
    "@opennextjs/cloudflare": {
      getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
    },
    "@alook/shared": async () => ({
      createDb: vi.fn(() => ({})),
      queries: {
        runtime: {
          getAgentRuntimeForWorkspace: (...a: any[]) =>
            mockGetAgentRuntimeForWorkspace(...a),
          setAgentRuntimeOffline: (...a: any[]) =>
            mockSetAgentRuntimeOffline(...a),
        },
      },
      DeregisterRequestSchema: (await import("@alook/shared"))
        .DeregisterRequestSchema,
    }),
    "@/lib/logger": {
      log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    },
  };
}

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/daemon/deregister", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/daemon/deregister", () => {
  beforeEach(() => vi.clearAllMocks());

  async function loadRoute(authCtx: Record<string, unknown>) {
    vi.resetModules();

    const mocks = sharedMocks();

    vi.doMock("@opennextjs/cloudflare", () => mocks["@opennextjs/cloudflare"]);
    vi.doMock("@alook/shared", mocks["@alook/shared"]);
    vi.doMock("@/lib/logger", () => mocks["@/lib/logger"]);
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
  const jwtAuth = { userId: "u1", email: "u@t.com" };

  it("sets owned runtimes offline", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace
      .mockResolvedValueOnce({ id: "rt1" })
      .mockResolvedValueOnce({ id: "rt2" });
    mockSetAgentRuntimeOffline.mockResolvedValue(undefined);

    const res = await POST(makeReq({ runtime_ids: ["rt1", "rt2"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(mockSetAgentRuntimeOffline).toHaveBeenCalledTimes(2);
    expect(mockSetAgentRuntimeOffline).toHaveBeenCalledWith({}, "rt1");
    expect(mockSetAgentRuntimeOffline).toHaveBeenCalledWith({}, "rt2");
  });

  it("skips unowned runtimes", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace
      .mockResolvedValueOnce({ id: "rt1" })
      .mockResolvedValueOnce(null); // rt2 not owned
    mockSetAgentRuntimeOffline.mockResolvedValue(undefined);

    const res = await POST(makeReq({ runtime_ids: ["rt1", "rt2"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(mockSetAgentRuntimeOffline).toHaveBeenCalledTimes(1);
    expect(mockSetAgentRuntimeOffline).toHaveBeenCalledWith({}, "rt1");
  });

  it("returns 200 with empty runtime_ids (no-op)", async () => {
    const POST = await loadRoute(daemonAuth);

    const res = await POST(makeReq({ runtime_ids: [] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(mockGetAgentRuntimeForWorkspace).not.toHaveBeenCalled();
    expect(mockSetAgentRuntimeOffline).not.toHaveBeenCalled();
  });

  it("returns 403 when called without workspaceId", async () => {
    const POST = await loadRoute(jwtAuth);

    const res = await POST(makeReq({ runtime_ids: ["rt1"] }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toContain("machine token required");
  });

  it("continues processing remaining runtimes after DB error on one", async () => {
    const POST = await loadRoute(daemonAuth);

    mockGetAgentRuntimeForWorkspace
      .mockResolvedValueOnce({ id: "rt1" })
      .mockResolvedValueOnce({ id: "rt2" });
    mockSetAgentRuntimeOffline
      .mockRejectedValueOnce(new Error("DB connection lost"))
      .mockResolvedValueOnce(undefined);

    const res = await POST(makeReq({ runtime_ids: ["rt1", "rt2"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
    expect(mockSetAgentRuntimeOffline).toHaveBeenCalledTimes(2);
  });
});
