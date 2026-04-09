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
vi.mock("@/lib/db/queries/conversation");
vi.mock("@/lib/db/queries/message");
vi.mock("@/lib/services/task", () => ({
  TaskService: vi.fn().mockImplementation(() => ({
    enqueueTask: vi.fn(async () => ({
      id: "t1", agentId: "a1", runtimeId: "r1", conversationId: "c1",
      workspaceId: "w1", prompt: "hi", status: "queued", priority: 0,
      dispatchedAt: null, startedAt: null, completedAt: null,
      result: null, error: null, createdAt: new Date(),
    })),
  })),
}));
vi.mock("@/lib/api/responses", () => ({
  messageToResponse: vi.fn((m: any) => ({ id: m.id })),
  taskToResponse: vi.fn((t: any) => ({ id: t.id })),
}));

import { getConversation, updateConversationTitle } from "@/lib/db/queries/conversation";
import { listMessages, createMessage } from "@/lib/db/queries/message";

const mockGetConv = vi.mocked(getConversation);
const mockListMessages = vi.mocked(listMessages);
const mockCreateMessage = vi.mocked(createMessage);
const mockUpdateTitle = vi.mocked(updateConversationTitle);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/conversations/[id]/messages", () => {
  it("lists messages", async () => {
    mockGetConv.mockResolvedValue({ id: "c1", workspaceId: "w1" } as any);
    mockListMessages.mockResolvedValue([{ id: "m1" }] as any);
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("http://localhost/api/conversations/c1/messages?workspace_id=w1"),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/conversations/[id]/messages", () => {
  it("sends message and enqueues task, returns 201", async () => {
    mockGetConv.mockResolvedValue({ id: "c1", workspaceId: "w1", agentId: "a1" } as any);
    mockCreateMessage.mockResolvedValue({ id: "m1" } as any);
    mockUpdateTitle.mockResolvedValue(null as any);
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/conversations/c1/messages?workspace_id=w1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBeDefined();
    expect(body.task).toBeDefined();
  });

  it("auto-titles conversation with truncated first message", async () => {
    mockGetConv.mockResolvedValue({ id: "c1", workspaceId: "w1", agentId: "a1" } as any);
    mockCreateMessage.mockResolvedValue({ id: "m1" } as any);
    mockUpdateTitle.mockResolvedValue({ id: "c1" } as any);
    const { POST } = await import("./route");
    await POST(
      new NextRequest("http://localhost/api/conversations/c1/messages?workspace_id=w1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Fix the authentication middleware bug in the login flow for production users" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(mockUpdateTitle).toHaveBeenCalledWith(
      {},
      "c1",
      expect.any(String),
    );
    // Title should be truncated to ~50 chars at word boundary
    const titleArg = mockUpdateTitle.mock.calls[0][2];
    expect(titleArg.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(titleArg).toContain("...");
  });

  it("auto-title does not fail if update returns null (title already set)", async () => {
    mockGetConv.mockResolvedValue({ id: "c1", workspaceId: "w1", agentId: "a1" } as any);
    mockCreateMessage.mockResolvedValue({ id: "m1" } as any);
    mockUpdateTitle.mockResolvedValue(null as any); // title already set
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/conversations/c1/messages?workspace_id=w1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello again" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(201);
  });

  it("short messages are not truncated", async () => {
    mockGetConv.mockResolvedValue({ id: "c1", workspaceId: "w1", agentId: "a1" } as any);
    mockCreateMessage.mockResolvedValue({ id: "m1" } as any);
    mockUpdateTitle.mockResolvedValue({ id: "c1" } as any);
    const { POST } = await import("./route");
    await POST(
      new NextRequest("http://localhost/api/conversations/c1/messages?workspace_id=w1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Fix the auth bug" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const titleArg = mockUpdateTitle.mock.calls[0][2];
    expect(titleArg).toBe("Fix the auth bug");
    expect(titleArg).not.toContain("...");
  });

  it("returns 400 for missing content", async () => {
    mockGetConv.mockResolvedValue({ id: "c1", workspaceId: "w1" } as any);
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/conversations/c1/messages?workspace_id=w1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when conversation not found", async () => {
    mockGetConv.mockResolvedValue(null as any);
    mockCreateMessage.mockResolvedValue({ id: "m1" } as any);
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("http://localhost/api/conversations/c1/messages?workspace_id=w1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(404);
  });
});
