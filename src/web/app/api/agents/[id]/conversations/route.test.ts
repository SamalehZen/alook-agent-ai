import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { userId: "u1", email: "u@t.com", params });
  }),
}));
vi.mock("@/lib/middleware/workspace", () => ({
  withWorkspaceMember: vi.fn(async () => ({ workspaceId: "w1" })),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/queries/agent");
vi.mock("@/lib/db/queries/conversation");
vi.mock("@/lib/api/responses", () => ({
  conversationToResponse: vi.fn((c: any) => ({
    id: c.id,
    agent_id: c.agentId,
    title: c.title,
    message_count: c.messageCount,
  })),
}));

import { getAgentInWorkspace } from "@/lib/db/queries/agent";
import { listConversationsByAgent } from "@/lib/db/queries/conversation";

const mockGetAgent = vi.mocked(getAgentInWorkspace);
const mockListConvs = vi.mocked(listConversationsByAgent);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/agents/[id]/conversations", () => {
  it("returns 200 with filtered conversations", async () => {
    mockGetAgent.mockResolvedValue({ id: "a1", workspaceId: "w1" } as any);
    mockListConvs.mockResolvedValue([
      { id: "c1", agentId: "a1", title: "Fix auth", messageCount: 5, createdAt: new Date() },
      { id: "c2", agentId: "a1", title: "", messageCount: 0, createdAt: new Date() },
    ] as any);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/agents/a1/conversations"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].message_count).toBe(5);
    expect(body[1].message_count).toBe(0);
  });

  it("returns 404 for non-existent agent", async () => {
    mockGetAgent.mockResolvedValue(null as any);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/agents/nope/conversations"),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns empty array for agent with no conversations", async () => {
    mockGetAgent.mockResolvedValue({ id: "a1", workspaceId: "w1" } as any);
    mockListConvs.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/agents/a1/conversations"),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
