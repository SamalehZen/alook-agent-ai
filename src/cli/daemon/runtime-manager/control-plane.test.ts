import { describe, it, expect, vi } from "vitest";
import { ControlPlaneClient } from "./control-plane.js";

type Call = { url: string; init: RequestInit | undefined };

function makeRes(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

function client(fetchFn: typeof fetch, extra: Partial<{ maxRetries: number; retryDelayMs: number }> = {}) {
  return new ControlPlaneClient({
    baseUrl: "https://srv.example.com/",
    secret: "s3cr3t",
    fetchFn,
    maxRetries: extra.maxRetries ?? 2,
    retryDelayMs: extra.retryDelayMs ?? 0,
  });
}

describe("ControlPlaneClient.listManagedRuntimes", () => {
  it("sends the secret header and parses/normalizes rows", async () => {
    const calls: Call[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return makeRes(200, {
        runtimes: [
          { id: "rt1", workspaceId: "ws1", daemonId: "managed_ws1", provider: "opencode", runtimeMode: "managed", machineLastSeenAt: "2026-01-01" },
          { id: "rt2", workspaceId: "ws2" }, // missing provider/mode → defaults
          { id: "rt3", workspaceId: "" }, // dropped
        ],
      });
    }) as unknown as typeof fetch;

    const rows = await client(fetchFn).listManagedRuntimes();

    expect(calls[0].url).toBe("https://srv.example.com/api/runtime-manager/managed-runtimes");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["X-Runtime-Manager-Secret"]).toBe("s3cr3t");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: "rt1",
      workspaceId: "ws1",
      daemonId: "managed_ws1",
      provider: "opencode",
      runtimeMode: "managed",
      machineLastSeenAt: "2026-01-01",
    });
    expect(rows[1].provider).toBe("opencode");
    expect(rows[1].runtimeMode).toBe("managed");
    expect(rows[1].machineLastSeenAt).toBeNull();
  });

  it("returns [] when the payload has no runtimes array", async () => {
    const fetchFn = vi.fn(async () => makeRes(200, {})) as unknown as typeof fetch;
    expect(await client(fetchFn).listManagedRuntimes()).toEqual([]);
  });

  it("retries network errors then succeeds", async () => {
    let n = 0;
    const fetchFn = vi.fn(async () => {
      n++;
      if (n < 2) throw new TypeError("network down");
      return makeRes(200, { runtimes: [{ id: "x", workspaceId: "ws" }] });
    }) as unknown as typeof fetch;

    const rows = await client(fetchFn).listManagedRuntimes();
    expect(n).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it("surfaces HTTP errors without retrying", async () => {
    const fetchFn = vi.fn(async () => makeRes(401, "unauthorized")) as unknown as typeof fetch;
    await expect(client(fetchFn).listManagedRuntimes()).rejects.toThrow(/HTTP 401/);
    expect((fetchFn as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });
});

describe("ControlPlaneClient.provisionToken", () => {
  it("POSTs workspace_id and returns the token", async () => {
    const calls: Call[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return makeRes(201, { token: "al_abc", workspace_id: "ws1" });
    }) as unknown as typeof fetch;

    const token = await client(fetchFn).provisionToken("ws1");
    expect(token).toBe("al_abc");
    expect(calls[0].url).toBe("https://srv.example.com/api/runtime-manager/provision");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ workspace_id: "ws1" });
  });

  it("throws when no token is returned", async () => {
    const fetchFn = vi.fn(async () => makeRes(200, {})) as unknown as typeof fetch;
    await expect(client(fetchFn).provisionToken("ws1")).rejects.toThrow(/no token/);
  });
});
