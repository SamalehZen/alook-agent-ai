import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "./errors";

// Mock localStorage and window
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });
Object.defineProperty(globalThis, "document", {
  value: { cookie: "" },
  writable: true,
});

// We need to mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Prevent 401 redirect from blowing up
Object.defineProperty(globalThis, "window", {
  value: {
    ...(globalThis.window || {}),
    location: { href: "" },
  },
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  // Reset window.location.href
  if (typeof window !== "undefined") {
    window.location.href = "";
  }
});

describe("ApiError class", () => {
  it("constructs with message, status, and details", () => {
    const err = new ApiError("bad request", 400, ["field: required"]);
    expect(err.message).toBe("bad request");
    expect(err.status).toBe(400);
    expect(err.details).toEqual(["field: required"]);
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("isNetworkError returns true for status 0", () => {
    expect(new ApiError("offline", 0).isNetworkError).toBe(true);
    expect(new ApiError("not found", 404).isNetworkError).toBe(false);
  });

  it("isRateLimit returns true for status 429", () => {
    expect(new ApiError("rate limit", 429).isRateLimit).toBe(true);
    expect(new ApiError("bad", 400).isRateLimit).toBe(false);
  });

  it("isUnauthorized returns true for status 401", () => {
    expect(new ApiError("unauth", 401).isUnauthorized).toBe(true);
    expect(new ApiError("ok", 200).isUnauthorized).toBe(false);
  });
});

// We dynamically import to get the patched fetch
async function getApiFetch() {
  // Re-import to pick up mocked fetch
  const mod = await import("./api");
  return mod;
}

describe("apiFetch", () => {
  it("returns ApiError on 400 with { error } JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "name is required" }),
    });

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).message).toBe("name is required");
      expect((e as ApiError).status).toBe(400);
    }
  });

  it("propagates details on 400 with details array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: "validation error",
        details: ["name: required", "email: invalid"],
      }),
    });

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).details).toEqual(["name: required", "email: invalid"]);
    }
  });

  it("returns ApiError with status 0 on network TypeError", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(0);
      expect((e as ApiError).message).toBe("Unable to connect — check your network");
      expect((e as ApiError).isNetworkError).toBe(true);
    }
  });

  it("returns ApiError with 'Please wait' on 429", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "rate limited" }),
    });

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(429);
      expect((e as ApiError).message).toBe("Please wait a moment before trying again");
      expect((e as ApiError).isRateLimit).toBe(true);
    }
  });

  it("returns generic message on 500 with non-JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("not json"); },
    });

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(500);
      expect((e as ApiError).message).toBe("Something went wrong — please try again");
    }
  });

  it("uses server error message on 500 with JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "database connection failed" }),
    });

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).message).toBe("database connection failed");
    }
  });

  it("returns generic message on 502 with empty body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error("empty"); },
    });

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(502);
      expect((e as ApiError).message).toBe("Something went wrong — please try again");
    }
  });

  it("redirects on 401 and throws ApiError", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" }),
    });

    const { listAgents } = await getApiFetch();
    try {
      await listAgents();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(401);
      expect((e as ApiError).message).toBe("Unauthorized");
      expect((e as ApiError).isUnauthorized).toBe(true);
    }
  });
});
