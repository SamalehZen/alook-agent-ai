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
  createTask,
  getTask,
  getTaskStatus,
  deleteTasksByConversation,
  hasPendingTaskForConversation,
  countRunningTasks,
  claimTask,
  startTask,
  completeTask,
} from "./task";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

/** Shared helper: seeds the full FK chain and returns all entities. */
async function seedFullChain(tx: Parameters<Parameters<typeof withTestTransaction>[1]>[0]) {
  const user = await seedUser(tx);
  const ws = await seedWorkspace(tx);
  await seedMember(tx, ws.id, user.id);
  const rt = await seedRuntime(tx, ws.id);
  const agent = await seedAgent(tx, ws.id, rt.id, user.id);
  const conv = await seedConversation(tx, ws.id, agent.id, user.id);
  return { user, ws, rt, agent, conv };
}

describe("createTask", () => {
  it("inserts task with correct fields", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);

      const task = await createTask(tx, {
        agentId: agent.id,
        runtimeId: rt.id,
        workspaceId: ws.id,
        conversationId: conv.id,
        prompt: "Do the thing",
        priority: 5,
      });

      expect(task.id).toBeDefined();
      expect(task.prompt).toBe("Do the thing");
      expect(task.priority).toBe(5);
      expect(task.status).toBe("queued");
      expect(task.agentId).toBe(agent.id);
      expect(task.conversationId).toBe(conv.id);
    });
  });
});

describe("getTask", () => {
  it("returns task by ID", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      const task = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "test",
      });

      const fetched = await getTask(tx, task.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(task.id);
    });
  });

  it("returns null for non-existent ID", async () => {
    await withTestTransaction(db, async (tx) => {
      const result = await getTask(tx, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });
});

describe("getTaskStatus", () => {
  it("returns status of existing task", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      const task = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "test",
      });

      const status = await getTaskStatus(tx, task.id);
      expect(status).toBe("queued");
    });
  });

  it("returns null for non-existent ID", async () => {
    await withTestTransaction(db, async (tx) => {
      const status = await getTaskStatus(tx, "00000000-0000-0000-0000-000000000000");
      expect(status).toBeNull();
    });
  });
});

describe("deleteTasksByConversation", () => {
  it("removes all tasks for a conversation", async () => {
    await withTestTransaction(db, async (tx) => {
      const { user, ws, rt, agent, conv } = await seedFullChain(tx);

      // Need separate conversations for multiple queued tasks (partial unique index)
      const conv2 = await seedConversation(tx, ws.id, agent.id, user.id);

      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "task 1",
      });
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv2.id, prompt: "task 2",
      });

      const deleted = await deleteTasksByConversation(tx, conv.id);
      expect(deleted).toHaveLength(1);

      // conv2 task still exists
      const pending = await hasPendingTaskForConversation(tx, conv2.id);
      expect(pending).toBe(true);
    });
  });

  it("returns empty array when no tasks exist", async () => {
    await withTestTransaction(db, async (tx) => {
      const { conv } = await seedFullChain(tx);
      const deleted = await deleteTasksByConversation(tx, conv.id);
      expect(deleted).toEqual([]);
    });
  });
});

describe("hasPendingTaskForConversation", () => {
  it("returns true when queued tasks exist", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);

      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "pending task",
      });

      const result = await hasPendingTaskForConversation(tx, conv.id);
      expect(result).toBe(true);
    });
  });

  it("returns false when only completed/failed tasks exist", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);

      // Create a task and transition it to completed: queued -> dispatched -> running -> completed
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "done task",
      });

      const claimed = await claimTask(tx, agent.id);
      expect(claimed).not.toBeNull();

      const started = await startTask(tx, claimed!.id);
      expect(started).not.toBeNull();

      const completed = await completeTask(tx, started!.id, {
        result: { output: "done" },
        sessionId: null,
        workDir: null,
      });
      expect(completed).not.toBeNull();

      // Now only a completed task exists — should return false
      const result = await hasPendingTaskForConversation(tx, conv.id);
      expect(result).toBe(false);
    });
  });

  it("returns false when no tasks exist", async () => {
    await withTestTransaction(db, async (tx) => {
      const { conv } = await seedFullChain(tx);
      const result = await hasPendingTaskForConversation(tx, conv.id);
      expect(result).toBe(false);
    });
  });
});

describe("countRunningTasks", () => {
  it("returns correct count of dispatched+running tasks", async () => {
    await withTestTransaction(db, async (tx) => {
      const { user, ws, rt, agent, conv } = await seedFullChain(tx);

      // Create tasks in separate conversations (partial unique index constraint)
      const conv2 = await seedConversation(tx, ws.id, agent.id, user.id);
      const conv3 = await seedConversation(tx, ws.id, agent.id, user.id);

      // Create queued tasks
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "task 1",
      });
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv2.id, prompt: "task 2",
      });
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv3.id, prompt: "task 3",
      });

      // queued tasks should not be counted
      expect(await countRunningTasks(tx, agent.id)).toBe(0);

      // Claim one task (queued -> dispatched) — dispatched counts
      const claimed1 = await claimTask(tx, agent.id);
      expect(claimed1).not.toBeNull();
      expect(await countRunningTasks(tx, agent.id)).toBe(1);

      // Start it (dispatched -> running) — running also counts
      await startTask(tx, claimed1!.id);
      expect(await countRunningTasks(tx, agent.id)).toBe(1);

      // Claim another (now 1 running + 1 dispatched = 2)
      const claimed2 = await claimTask(tx, agent.id);
      expect(claimed2).not.toBeNull();
      expect(await countRunningTasks(tx, agent.id)).toBe(2);
    });
  });

  it("returns 0 when all tasks are completed", async () => {
    await withTestTransaction(db, async (tx) => {
      const { agent } = await seedFullChain(tx);

      // No tasks at all
      const count = await countRunningTasks(tx, agent.id);
      expect(count).toBe(0);
    });
  });
});
