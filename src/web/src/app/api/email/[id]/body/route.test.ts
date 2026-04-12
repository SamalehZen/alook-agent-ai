import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockR2Get = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({
    env: { DB: {}, EMAIL_BUCKET: { get: (...args: unknown[]) => mockR2Get(...args) } },
  })),
}));

const mockGetEmailById = vi.fn();
const mockGetAgentInWorkspace = vi.fn();

vi.mock("@alook/shared", () => ({
  createDb: vi.fn(() => ({})),
  queries: {
    email: { getEmailById: (...args: unknown[]) => mockGetEmailById(...args) },
    agent: { getAgentInWorkspace: (...args: unknown[]) => mockGetAgentInWorkspace(...args) },
  },
}));

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { userId: "u1", email: "u@t.com", params });
  }),
}));

vi.mock("@/lib/middleware/workspace", () => ({
  withWorkspaceMember: vi.fn(async () => ({ workspaceId: "ws1" })),
}));

vi.mock("@/lib/middleware/helpers", () => {
  const { NextResponse } = require("next/server");
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  };
});

import { GET } from "./route";

function makeR2Object(text: string) {
  return { text: () => Promise.resolve(text) };
}

describe("GET /api/email/[id]/body", () => {
  beforeEach(() => vi.clearAllMocks());

  it("strips RFC822 headers (CRLF) and returns only body text", async () => {
    mockGetEmailById.mockResolvedValue({ id: "e1", agentId: "a1", r2Key: "emails/abc/raw" });
    mockGetAgentInWorkspace.mockResolvedValue({ id: "a1" });
    mockR2Get.mockResolvedValue(
      makeR2Object("From: a@b.com\r\nTo: c@d.com\r\nSubject: Test\r\n\r\nHello world")
    );

    const req = new NextRequest("http://localhost/api/email/e1/body?workspace_id=ws1");
    const res = await GET(req, { params: Promise.resolve({ id: "e1" }) } as any);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello world");
  });

  it("strips RFC822 headers (LF) and returns only body text", async () => {
    mockGetEmailById.mockResolvedValue({ id: "e1", agentId: "a1", r2Key: "emails/abc/raw" });
    mockGetAgentInWorkspace.mockResolvedValue({ id: "a1" });
    mockR2Get.mockResolvedValue(
      makeR2Object("From: a@b.com\nTo: c@d.com\nSubject: Test\n\nHello world")
    );

    const req = new NextRequest("http://localhost/api/email/e1/body?workspace_id=ws1");
    const res = await GET(req, { params: Promise.resolve({ id: "e1" }) } as any);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello world");
  });

  it("returns full content if no header/body separator found", async () => {
    mockGetEmailById.mockResolvedValue({ id: "e1", agentId: "a1", r2Key: "emails/abc/raw" });
    mockGetAgentInWorkspace.mockResolvedValue({ id: "a1" });
    mockR2Get.mockResolvedValue(makeR2Object("Just plain text with no headers"));

    const req = new NextRequest("http://localhost/api/email/e1/body?workspace_id=ws1");
    const res = await GET(req, { params: Promise.resolve({ id: "e1" }) } as any);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Just plain text with no headers");
  });

  it("returns 404 when R2 object not found", async () => {
    mockGetEmailById.mockResolvedValue({ id: "e1", agentId: "a1", r2Key: "emails/abc/raw" });
    mockGetAgentInWorkspace.mockResolvedValue({ id: "a1" });
    mockR2Get.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/email/e1/body?workspace_id=ws1");
    const res = await GET(req, { params: Promise.resolve({ id: "e1" }) } as any);

    expect(res.status).toBe(404);
  });
});
