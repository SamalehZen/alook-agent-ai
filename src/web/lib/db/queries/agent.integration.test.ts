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
import { deleteAgent, getAgent } from "./agent";
import { createTask, getTask } from "./task";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

describe("deleteAgent", () => {
  it("removes agent and its tasks in a transaction", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);
      const conv = await seedConversation(tx, ws.id, agent.id, user.id);

      // Create a task for this agent
      const task = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "orphan check",
      });

      const deleted = await deleteAgent(tx, agent.id, ws.id);
      expect(deleted).not.toBeNull();
      expect(deleted!.id).toBe(agent.id);

      // Agent should be gone
      const fetchedAgent = await getAgent(tx, agent.id);
      expect(fetchedAgent).toBeNull();

      // Task should also be gone (deleted in the transaction)
      const fetchedTask = await getTask(tx, task.id);
      expect(fetchedTask).toBeNull();
    });
  });

  it("returns null for non-matching workspace", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      const ws2 = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);

      // Try to delete with wrong workspace
      const result = await deleteAgent(tx, agent.id, ws2.id);
      expect(result).toBeNull();

      // Agent should still exist
      const fetched = await getAgent(tx, agent.id);
      expect(fetched).not.toBeNull();
    });
  });
});
