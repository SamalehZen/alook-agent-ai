import { eq, and, asc, or, lt, isNull } from "drizzle-orm";
import { agentRuntime, agent, agentTaskQueue } from "../schema";
import type { Database } from "../index";

export async function upsertAgentRuntime(
  db: Database,
  data: {
    workspaceId: string;
    daemonId: string;
    name: string;
    runtimeMode: string;
    provider: string;
    status: string;
    deviceInfo: string;
    metadata?: unknown;
  }
) {
  const now = new Date().toISOString();
  const rows = await db
    .insert(agentRuntime)
    .values({
      workspaceId: data.workspaceId,
      daemonId: data.daemonId,
      name: data.name,
      runtimeMode: data.runtimeMode,
      provider: data.provider,
      status: data.status,
      deviceInfo: data.deviceInfo,
      metadata: data.metadata ?? null,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [
        agentRuntime.workspaceId,
        agentRuntime.daemonId,
        agentRuntime.provider,
      ],
      set: {
        name: data.name,
        runtimeMode: data.runtimeMode,
        status: data.status,
        deviceInfo: data.deviceInfo,
        metadata: data.metadata ?? null,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning();
  return rows[0]!;
}

export async function listAgentRuntimes(db: Database, workspaceId: string) {
  return db
    .select()
    .from(agentRuntime)
    .where(eq(agentRuntime.workspaceId, workspaceId))
    .orderBy(asc(agentRuntime.createdAt));
}

export async function getAgentRuntime(db: Database, id: string) {
  const rows = await db
    .select()
    .from(agentRuntime)
    .where(eq(agentRuntime.id, id));
  return rows[0] ?? null;
}

export async function getAgentRuntimeForWorkspace(
  db: Database,
  id: string,
  workspaceId: string
) {
  const rows = await db
    .select()
    .from(agentRuntime)
    .where(
      and(eq(agentRuntime.id, id), eq(agentRuntime.workspaceId, workspaceId))
    );
  return rows[0] ?? null;
}

export async function updateAgentRuntimeHeartbeat(db: Database, id: string) {
  const now = new Date().toISOString();
  const rows = await db
    .update(agentRuntime)
    .set({ lastSeenAt: now, status: "online", updatedAt: now })
    .where(eq(agentRuntime.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function setAgentRuntimeOffline(db: Database, id: string) {
  await db
    .update(agentRuntime)
    .set({ status: "offline", updatedAt: new Date().toISOString() })
    .where(eq(agentRuntime.id, id));
}

export async function deleteRuntimesByDaemonId(
  db: Database,
  daemonId: string,
  workspaceId: string
) {
  // Find runtime IDs to delete
  const runtimes = await db
    .select({ id: agentRuntime.id })
    .from(agentRuntime)
    .where(
      and(
        eq(agentRuntime.daemonId, daemonId),
        eq(agentRuntime.workspaceId, workspaceId)
      )
    );

  if (runtimes.length === 0) return;

  const ids = runtimes.map((r) => r.id);

  // Null out agent references and delete tasks per runtime
  for (const id of ids) {
    await db
      .update(agent)
      .set({ runtimeId: null, updatedAt: new Date().toISOString() })
      .where(eq(agent.runtimeId, id));

    await db
      .delete(agentTaskQueue)
      .where(eq(agentTaskQueue.runtimeId, id));
  }

  // Delete the runtimes
  await db
    .delete(agentRuntime)
    .where(
      and(
        eq(agentRuntime.daemonId, daemonId),
        eq(agentRuntime.workspaceId, workspaceId)
      )
    );
}

export async function markStaleRuntimesOffline(
  db: Database,
  workspaceId: string
) {
  const threshold = new Date(Date.now() - 45 * 1000).toISOString();
  await db
    .update(agentRuntime)
    .set({ status: "offline", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(agentRuntime.workspaceId, workspaceId),
        eq(agentRuntime.status, "online"),
        or(
          lt(agentRuntime.lastSeenAt, threshold),
          isNull(agentRuntime.lastSeenAt)
        )
      )
    );
}
