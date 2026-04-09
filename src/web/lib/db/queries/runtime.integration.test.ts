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
  upsertAgentRuntime,
  getAgentRuntime,
  deleteRuntimesByDaemonId,
  markStaleRuntimesOffline,
} from "./runtime";
import { getAgent } from "./agent";
import { createTask, getTask } from "./task";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

describe("upsertAgentRuntime", () => {
  it("inserts new runtime on first call", async () => {
    await withTestTransaction(db, async (tx) => {
      const ws = await seedWorkspace(tx);

      const rt = await upsertAgentRuntime(tx, {
        workspaceId: ws.id,
        daemonId: "daemon-1",
        name: "My Runtime",
        runtimeMode: "local",
        provider: "claude",
        status: "online",
        deviceInfo: "macOS",
      });

      expect(rt.id).toBeDefined();
      expect(rt.name).toBe("My Runtime");
      expect(rt.status).toBe("online");
      expect(rt.provider).toBe("claude");
    });
  });

  it("updates existing runtime on conflict (same workspace+daemon+provider)", async () => {
    await withTestTransaction(db, async (tx) => {
      const ws = await seedWorkspace(tx);

      const rt1 = await upsertAgentRuntime(tx, {
        workspaceId: ws.id,
        daemonId: "daemon-1",
        name: "Original",
        runtimeMode: "local",
        provider: "claude",
        status: "online",
        deviceInfo: "macOS",
      });

      const rt2 = await upsertAgentRuntime(tx, {
        workspaceId: ws.id,
        daemonId: "daemon-1",
        name: "Updated",
        runtimeMode: "remote",
        provider: "claude",
        status: "offline",
        deviceInfo: "Linux",
      });

      // Same ID (upsert, not new row)
      expect(rt2.id).toBe(rt1.id);
      // Fields updated
      expect(rt2.name).toBe("Updated");
      expect(rt2.status).toBe("offline");
      expect(rt2.deviceInfo).toBe("Linux");
    });
  });
});

describe("deleteRuntimesByDaemonId", () => {
  it("nulls agent.runtimeId, deletes tasks, deletes runtimes", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);
      const rt = await seedRuntime(tx, ws.id);
      const agent = await seedAgent(tx, ws.id, rt.id, user.id);
      const conv = await seedConversation(tx, ws.id, agent.id, user.id);

      const task = await createTask(tx, {
        agentId: agent.id, runtimeId: rt.id, workspaceId: ws.id,
        conversationId: conv.id, prompt: "will be deleted",
      });

      await deleteRuntimesByDaemonId(tx, rt.daemonId, ws.id);

      // Runtime should be gone
      const fetchedRt = await getAgentRuntime(tx, rt.id);
      expect(fetchedRt).toBeNull();

      // Agent should still exist but runtimeId nulled
      const fetchedAgent = await getAgent(tx, agent.id);
      expect(fetchedAgent).not.toBeNull();
      expect(fetchedAgent!.runtimeId).toBeNull();

      // Task should be gone
      const fetchedTask = await getTask(tx, task.id);
      expect(fetchedTask).toBeNull();
    });
  });

  it("is a no-op when no runtimes match", async () => {
    await withTestTransaction(db, async (tx) => {
      const ws = await seedWorkspace(tx);

      // Should not throw
      await deleteRuntimesByDaemonId(tx, "nonexistent-daemon", ws.id);
    });
  });
});

describe("markStaleRuntimesOffline", () => {
  it("marks online runtimes with old lastSeenAt as offline", async () => {
    await withTestTransaction(db, async (tx) => {
      const ws = await seedWorkspace(tx);

      // Create a runtime that was last seen 2 minutes ago
      const rt = await upsertAgentRuntime(tx, {
        workspaceId: ws.id,
        daemonId: "stale-daemon",
        name: "Stale",
        runtimeMode: "local",
        provider: "claude",
        status: "online",
        deviceInfo: "macOS",
      });

      // Manually backdate lastSeenAt by updating it
      // We need to use the raw DB to set an old timestamp
      const { agentRuntime } = await import("../schema");
      const { eq } = await import("drizzle-orm");
      const oldDate = new Date(Date.now() - 120 * 1000); // 2 minutes ago
      await (tx as any).update(agentRuntime).set({ lastSeenAt: oldDate }).where(eq(agentRuntime.id, rt.id));

      await markStaleRuntimesOffline(tx, ws.id);

      const fetched = await getAgentRuntime(tx, rt.id);
      expect(fetched!.status).toBe("offline");
    });
  });

  it("marks online runtimes with null lastSeenAt as offline", async () => {
    await withTestTransaction(db, async (tx) => {
      const ws = await seedWorkspace(tx);

      const rt = await upsertAgentRuntime(tx, {
        workspaceId: ws.id,
        daemonId: "null-heartbeat",
        name: "No Heartbeat",
        runtimeMode: "local",
        provider: "claude",
        status: "online",
        deviceInfo: "macOS",
      });

      // Set lastSeenAt to null
      const { agentRuntime } = await import("../schema");
      const { eq } = await import("drizzle-orm");
      await (tx as any).update(agentRuntime).set({ lastSeenAt: null }).where(eq(agentRuntime.id, rt.id));

      await markStaleRuntimesOffline(tx, ws.id);

      const fetched = await getAgentRuntime(tx, rt.id);
      expect(fetched!.status).toBe("offline");
    });
  });

  it("does not affect recently seen or already offline runtimes", async () => {
    await withTestTransaction(db, async (tx) => {
      const ws = await seedWorkspace(tx);

      // Recently seen online runtime
      const rtOnline = await upsertAgentRuntime(tx, {
        workspaceId: ws.id,
        daemonId: "fresh-daemon",
        name: "Fresh",
        runtimeMode: "local",
        provider: "claude",
        status: "online",
        deviceInfo: "macOS",
      });

      // Already offline runtime
      const rtOffline = await upsertAgentRuntime(tx, {
        workspaceId: ws.id,
        daemonId: "offline-daemon",
        name: "Offline",
        runtimeMode: "local",
        provider: "claude",
        status: "offline",
        deviceInfo: "macOS",
      });

      await markStaleRuntimesOffline(tx, ws.id);

      const fetchedOnline = await getAgentRuntime(tx, rtOnline.id);
      expect(fetchedOnline!.status).toBe("online"); // still online (recent heartbeat)

      const fetchedOffline = await getAgentRuntime(tx, rtOffline.id);
      expect(fetchedOffline!.status).toBe("offline"); // unchanged
    });
  });
});
