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
  claimTask,
  startTask,
  completeTask,
  failTask,
  cancelTask,
  failStaleDispatchedTasks,
  getLastTaskSession,
  listPendingTasksByRuntime,
} from "./task";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

async function seedFullChain(tx: any) {
  const user = await seedUser(tx);
  const ws = await seedWorkspace(tx);
  await seedMember(tx, ws.id, user.id);
  const rt = await seedRuntime(tx, ws.id);
  const agent = await seedAgent(tx, ws.id, rt.id, user.id);
  const conv = await seedConversation(tx, ws.id, agent.id, user.id);
  return { user, ws, rt, agent, conv };
}

describe("claimTask", () => {
  it("claims the highest-priority queued task", async () => {
    await withTestTransaction(db, async (tx) => {
      const { user, ws, rt, agent, conv } = await seedFullChain(tx);
      const conv2 = await seedConversation(tx, ws.id, agent.id, user.id);
      const conv3 = await seedConversation(tx, ws.id, agent.id, user.id);

      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "low priority", priority: 1,
      });
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv2.id, prompt: "high priority", priority: 10,
      });
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv3.id, prompt: "medium priority", priority: 5,
      });

      const claimed = await claimTask(tx, agent.id);
      expect(claimed).not.toBeNull();
      expect(claimed!.prompt).toBe("high priority");
      expect(claimed!.status).toBe("dispatched");
    });
  });

  it("skips conversations that already have dispatched/running tasks", async () => {
    await withTestTransaction(db, async (tx) => {
      const { user, ws, rt, agent, conv } = await seedFullChain(tx);
      const conv2 = await seedConversation(tx, ws.id, agent.id, user.id);

      // Create and claim task in conv (now dispatched)
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "already active",
      });
      await claimTask(tx, agent.id);

      // Create queued task in conv2
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv2.id, prompt: "should be claimed",
      });

      const claimed = await claimTask(tx, agent.id);
      expect(claimed).not.toBeNull();
      expect(claimed!.prompt).toBe("should be claimed");
    });
  });

  it("returns null when no queued tasks exist", async () => {
    await withTestTransaction(db, async (tx) => {
      const { agent } = await seedFullChain(tx);
      const result = await claimTask(tx, agent.id);
      expect(result).toBeNull();
    });
  });
});

describe("failTask", () => {
  it("transitions dispatched/running task to failed with error message", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "will fail",
      });

      const claimed = await claimTask(tx, agent.id);
      const failed = await failTask(tx, claimed!.id, "something broke");
      expect(failed).not.toBeNull();
      expect(failed!.status).toBe("failed");
      expect(failed!.error).toBe("something broke");
      expect(failed!.completedAt).not.toBeNull();
    });
  });

  it("returns null for queued/completed tasks (wrong state)", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      const task = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "queued task",
      });

      // Can't fail a queued task (must be dispatched or running)
      const result = await failTask(tx, task.id, "nope");
      expect(result).toBeNull();
    });
  });
});

describe("cancelTask", () => {
  it("transitions queued/dispatched/running task to cancelled", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      const task = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "cancel me",
      });

      const cancelled = await cancelTask(tx, task.id);
      expect(cancelled).not.toBeNull();
      expect(cancelled!.status).toBe("cancelled");
      expect(cancelled!.completedAt).not.toBeNull();
    });
  });

  it("returns null for already completed/failed tasks", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "will complete",
      });

      const claimed = await claimTask(tx, agent.id);
      await startTask(tx, claimed!.id);
      await completeTask(tx, claimed!.id, { result: {}, sessionId: null, workDir: null });

      const result = await cancelTask(tx, claimed!.id);
      expect(result).toBeNull();
    });
  });
});

describe("failStaleDispatchedTasks", () => {
  it("fails tasks dispatched more than N seconds ago", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "stale task",
      });

      // Claim to get it dispatched
      const claimed = await claimTask(tx, agent.id);
      expect(claimed).not.toBeNull();

      // Use a very short staleSeconds (0) so the just-dispatched task is already stale
      const failed = await failStaleDispatchedTasks(tx, 0);
      expect(failed.length).toBe(1);
      expect(failed[0].agentId).toBe(agent.id);
    });
  });

  it("does not fail recently dispatched tasks", async () => {
    await withTestTransaction(db, async (tx) => {
      const { ws, rt, agent, conv } = await seedFullChain(tx);
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "fresh task",
      });

      await claimTask(tx, agent.id);

      // Use a long staleSeconds so nothing is stale
      const failed = await failStaleDispatchedTasks(tx, 9999);
      expect(failed).toHaveLength(0);
    });
  });
});

describe("getLastTaskSession", () => {
  it("returns sessionId/workDir from most recent completed task", async () => {
    await withTestTransaction(db, async (tx) => {
      const { user, ws, rt, agent, conv } = await seedFullChain(tx);

      // Create, claim, start, complete a task with session info
      await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "task with session",
      });
      const claimed = await claimTask(tx, agent.id);
      await startTask(tx, claimed!.id);
      await completeTask(tx, claimed!.id, {
        result: { ok: true },
        sessionId: "sess-123",
        workDir: "/tmp/work",
      });

      const session = await getLastTaskSession(tx, agent.id, conv.id);
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe("sess-123");
      expect(session!.workDir).toBe("/tmp/work");
    });
  });

  it("returns null when no completed tasks with sessionId exist", async () => {
    await withTestTransaction(db, async (tx) => {
      const { agent, conv } = await seedFullChain(tx);

      const session = await getLastTaskSession(tx, agent.id, conv.id);
      expect(session).toBeNull();
    });
  });
});

describe("listPendingTasksByRuntime", () => {
  it("returns queued/dispatched tasks ordered by priority desc, createdAt asc", async () => {
    await withTestTransaction(db, async (tx) => {
      const { user, ws, rt, agent, conv } = await seedFullChain(tx);
      const conv2 = await seedConversation(tx, ws.id, agent.id, user.id);
      const conv3 = await seedConversation(tx, ws.id, agent.id, user.id);

      const t1 = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "low", priority: 1,
      });
      const t2 = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv2.id, prompt: "high", priority: 10,
      });
      const t3 = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv3.id, prompt: "medium", priority: 5,
      });

      const pending = await listPendingTasksByRuntime(tx, rt.id);
      expect(pending).toHaveLength(3);
      // Ordered by priority desc
      expect(pending[0].id).toBe(t2.id);
      expect(pending[1].id).toBe(t3.id);
      expect(pending[2].id).toBe(t1.id);
    });
  });
});
