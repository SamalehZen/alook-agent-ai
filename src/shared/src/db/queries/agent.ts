import { eq, and, desc } from "drizzle-orm";
import { agent, agentTaskQueue } from "../schema";
import type { Database } from "../index";

export async function getAgent(db: Database, id: string) {
  const rows = await db.select().from(agent).where(eq(agent.id, id));
  return rows[0] ?? null;
}

export async function getAgentInWorkspace(
  db: Database,
  id: string,
  workspaceId: string
) {
  const rows = await db
    .select()
    .from(agent)
    .where(and(eq(agent.id, id), eq(agent.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function listAgents(db: Database, workspaceId: string) {
  return db
    .select()
    .from(agent)
    .where(eq(agent.workspaceId, workspaceId))
    .orderBy(desc(agent.createdAt));
}

export async function createAgent(
  db: Database,
  data: {
    workspaceId: string;
    name: string;
    description?: string;
    instructions?: string;
    avatarUrl?: string | null;
    runtimeId?: string | null;
    runtimeMode?: string;
    runtimeConfig?: unknown;
    visibility?: string;
    maxConcurrentTasks?: number;
    ownerId?: string | null;
    tools?: unknown;
    triggers?: unknown;
    emailHandle?: string | null;
  }
) {
  const rows = await db
    .insert(agent)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description ?? "",
      instructions: data.instructions ?? "",
      avatarUrl: data.avatarUrl ?? null,
      runtimeId: data.runtimeId ?? null,
      runtimeMode: data.runtimeMode ?? "local",
      runtimeConfig: data.runtimeConfig ?? null,
      visibility: data.visibility ?? "private",
      maxConcurrentTasks: data.maxConcurrentTasks ?? 6,
      ownerId: data.ownerId ?? null,
      tools: data.tools ?? null,
      triggers: data.triggers ?? null,
      emailHandle: data.emailHandle ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function deleteAgent(
  db: Database,
  id: string,
  workspaceId: string
) {
  await db
    .delete(agentTaskQueue)
    .where(eq(agentTaskQueue.agentId, id));
  const rows = await db
    .delete(agent)
    .where(and(eq(agent.id, id), eq(agent.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function updateAgent(
  db: Database,
  id: string,
  workspaceId: string,
  data: {
    name?: string;
    description?: string;
    instructions?: string;
    runtimeId?: string | null;
  }
) {
  const rows = await db
    .update(agent)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(and(eq(agent.id, id), eq(agent.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function updateAgentStatus(
  db: Database,
  id: string,
  status: string
) {
  const rows = await db
    .update(agent)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(agent.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function getAgentByHandle(db: Database, emailHandle: string) {
  const rows = await db
    .select()
    .from(agent)
    .where(eq(agent.emailHandle, emailHandle));
  return rows[0] ?? null;
}
