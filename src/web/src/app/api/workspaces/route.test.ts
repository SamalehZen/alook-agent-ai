import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}));

const mockListWorkspaces = vi.fn();
const mockCreateWorkspace = vi.fn();
const mockCreateMember = vi.fn();

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual("@alook/shared");
  return {
    ...actual,
    createDb: vi.fn(() => ({})),
    queries: {
      workspace: {
        listWorkspaces: (...args: unknown[]) => mockListWorkspaces(...args),
        createWorkspace: (...args: unknown[]) => mockCreateWorkspace(...args),
      },
      member: {
        createMember: (...args: unknown[]) => mockCreateMember(...args),
      },
    },
  };
});

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { userId: "u1", email: "u@t.com", params });
  }),
}));

vi.mock("@/lib/middleware/helpers", () => {
  const { NextResponse } = require("next/server");
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  };
});

vi.mock("@/lib/api/responses", () => ({
  workspaceToResponse: vi.fn((w: any) => ({ id: w.id, name: w.name, slug: w.slug })),
}));

import { GET, POST } from "./route";

describe("GET /api/workspaces", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists user workspaces", async () => {
    mockListWorkspaces.mockResolvedValue([
      { id: "w1", name: "Acme", slug: "acme" },
      { id: "w2", name: "Beta", slug: "beta" },
    ]);

    const req = new NextRequest("http://localhost/api/workspaces");
    const res = await GET(req, {} as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "w1", name: "Acme", slug: "acme" },
      { id: "w2", name: "Beta", slug: "beta" },
    ]);
    expect(mockListWorkspaces).toHaveBeenCalledWith({}, "u1");
  });
});

describe("POST /api/workspaces", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates workspace with member and returns 201", async () => {
    mockCreateWorkspace.mockResolvedValue({ id: "w-new", name: "New", slug: "new" });
    mockCreateMember.mockResolvedValue({});

    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "New", slug: "new" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, {} as any);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "w-new", name: "New", slug: "new" });
    expect(mockCreateWorkspace).toHaveBeenCalledWith({}, { name: "New", slug: "new" });
    expect(mockCreateMember).toHaveBeenCalledWith({}, {
      workspaceId: "w-new",
      userId: "u1",
      role: "owner",
    });
  });

  it("returns 400 for missing name", async () => {
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ slug: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, {} as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
  });

  it("returns 400 for missing slug", async () => {
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, {} as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "slug is required" });
  });

  it("returns 409 on duplicate slug", async () => {
    mockCreateWorkspace.mockRejectedValue(new Error("UNIQUE constraint failed: workspaces.slug"));

    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Dup", slug: "dup" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, {} as any);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "workspace slug already exists" });
  });

  it("returns 409 on duplicate slug wrapped with cause", async () => {
    const cause = new Error("UNIQUE constraint failed: workspaces.slug");
    const wrapped = new Error("Failed query: INSERT INTO ...");
    (wrapped as any).cause = cause;
    mockCreateWorkspace.mockRejectedValue(wrapped);

    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "Dup", slug: "dup" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, {} as any);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "workspace slug already exists" });
  });
});
