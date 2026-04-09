import { afterAll, describe, it, expect } from "vitest";
import {
  getTestClient,
  getTestDb,
  withTestTransaction,
  seedUser,
  seedWorkspace,
  seedMember,
  seedRuntime,
  seedAgent,
  seedConversation,
} from "../test-utils";
import {
  createConversation,
  getConversation,
  listConversationsByAgent,
  updateConversationTitle,
  deleteConversation,
} from "./conversation";
import { createMessage } from "./message";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

describe("listConversationsByAgent", () => {
  it("returns correct message_count for conversations with messages", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, {
        workspaceId: ws.id,
        agentId: agent.id,
        userId: user.id,
        title: "",
      });

      await createMessage(tx, { conversationId: conv.id, role: "user", content: "hello" });
      await createMessage(tx, { conversationId: conv.id, role: "assistant", content: "hi" });
      await createMessage(tx, { conversationId: conv.id, role: "user", content: "bye" });

      const result = await listConversationsByAgent(tx, ws.id, user.id, agent.id);
      expect(result).toHaveLength(1);
      expect(result[0].messageCount).toBe(3);
    });
  });

  it("returns 0 message_count for empty conversations", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      await createConversation(tx, {
        workspaceId: ws.id,
        agentId: agent.id,
        userId: user.id,
        title: "",
      });

      const result = await listConversationsByAgent(tx, ws.id, user.id, agent.id);
      expect(result).toHaveLength(1);
      expect(result[0].messageCount).toBe(0);
    });
  });

  it("filters by agent, workspace, and user correctly", async () => {
    await withTestTransaction(db, async (tx) => {
      const user1 = await seedUser(tx);
      const user2 = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user1.id);
      await seedMember(tx, ws.id, user2.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent1 = await seedAgent(tx, ws.id, rt.id, user1.id);
      const agent2 = await seedAgent(tx, ws.id, rt.id, user2.id);

      // Create conversations for different agents/users
      await createConversation(tx, { workspaceId: ws.id, agentId: agent1.id, userId: user1.id, title: "" });
      await createConversation(tx, { workspaceId: ws.id, agentId: agent2.id, userId: user1.id, title: "" });
      await createConversation(tx, { workspaceId: ws.id, agentId: agent1.id, userId: user2.id, title: "" });

      const result = await listConversationsByAgent(tx, ws.id, user1.id, agent1.id);
      expect(result).toHaveLength(1);
    });
  });

  it("orders by newest first", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      // Insert with explicit createdAt since now() is fixed within a transaction
      const earlier = new Date("2024-01-01T00:00:00Z");
      const later = new Date("2024-01-02T00:00:00Z");

      const conv1 = await seedConversation(tx, ws.id, agent.id, user.id, { title: "first", createdAt: earlier });
      const conv2 = await seedConversation(tx, ws.id, agent.id, user.id, { title: "second", createdAt: later });

      const result = await listConversationsByAgent(tx, ws.id, user.id, agent.id);
      expect(result).toHaveLength(2);
      // Newest first
      expect(result[0].id).toBe(conv2.id);
      expect(result[1].id).toBe(conv1.id);
    });
  });

  it("returns empty array for non-existent agent", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);

      const result = await listConversationsByAgent(tx, ws.id, user.id, "00000000-0000-0000-0000-000000000000");
      expect(result).toEqual([]);
    });
  });
});

describe("updateConversationTitle", () => {
  it("sets title when current title is empty", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, { workspaceId: ws.id, agentId: agent.id, userId: user.id, title: "" });

      const updated = await updateConversationTitle(tx, conv.id, "New Title");
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe("New Title");
    });
  });

  it("returns null when title is already non-empty (no overwrite)", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, { workspaceId: ws.id, agentId: agent.id, userId: user.id, title: "Existing" });

      const result = await updateConversationTitle(tx, conv.id, "Overwrite Attempt");
      expect(result).toBeNull();

      // Verify title unchanged
      const fetched = await getConversation(tx, conv.id);
      expect(fetched!.title).toBe("Existing");
    });
  });

  it("concurrent calls — only first one wins", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, { workspaceId: ws.id, agentId: agent.id, userId: user.id, title: "" });

      const [r1, r2] = await Promise.all([
        updateConversationTitle(tx, conv.id, "Title A"),
        updateConversationTitle(tx, conv.id, "Title B"),
      ]);

      // Exactly one should succeed
      const successes = [r1, r2].filter((r) => r !== null);
      expect(successes).toHaveLength(1);

      const fetched = await getConversation(tx, conv.id);
      expect(["Title A", "Title B"]).toContain(fetched!.title);
    });
  });
});

describe("deleteConversation", () => {
  it("removes the conversation row", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, { workspaceId: ws.id, agentId: agent.id, userId: user.id, title: "" });

      const deleted = await deleteConversation(tx, conv.id);
      expect(deleted).not.toBeNull();
      expect(deleted!.id).toBe(conv.id);

      const fetched = await getConversation(tx, conv.id);
      expect(fetched).toBeNull();
    });
  });

  it("returns null for non-existent ID", async () => {
    await withTestTransaction(db, async (tx) => {
      const result = await deleteConversation(tx, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });
});

describe("createConversation", () => {
  it("inserts and returns with generated UUID", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, {
        workspaceId: ws.id,
        agentId: agent.id,
        userId: user.id,
        title: "My Conversation",
      });

      expect(conv.id).toBeDefined();
      expect(conv.title).toBe("My Conversation");
      expect(conv.workspaceId).toBe(ws.id);
      expect(conv.agentId).toBe(agent.id);
    });
  });
});

describe("getConversation", () => {
  it("returns row by ID", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, { workspaceId: ws.id, agentId: agent.id, userId: user.id, title: "Test" });

      const fetched = await getConversation(tx, conv.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(conv.id);
      expect(fetched!.title).toBe("Test");
    });
  });

  it("returns null for non-existent ID", async () => {
    await withTestTransaction(db, async (tx) => {
      const result = await getConversation(tx, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });
});

describe("transaction rollback isolation", () => {
  it("data inserted in one test is not visible in the next test", async () => {
    let insertedId: string | undefined;

    // First transaction: insert a conversation
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      const conv = await createConversation(tx, { workspaceId: ws.id, agentId: agent.id, userId: user.id, title: "ephemeral" });
      insertedId = conv.id;

      // Visible inside the transaction
      const fetched = await getConversation(tx, conv.id);
      expect(fetched).not.toBeNull();
    });

    // Second transaction: that ID should not exist
    await withTestTransaction(db, async (tx) => {
      const fetched = await getConversation(tx, insertedId!);
      expect(fetched).toBeNull();
    });
  });
});
