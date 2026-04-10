import { eq, and, desc, count } from "drizzle-orm";
import { conversation, message } from "../schema";
import type { Database } from "../index";

export async function createConversation(
  db: Database,
  data: {
    workspaceId: string;
    agentId: string;
    userId: string;
    title: string;
  }
) {
  const rows = await db
    .insert(conversation)
    .values({
      workspaceId: data.workspaceId,
      agentId: data.agentId,
      userId: data.userId,
      title: data.title,
    })
    .returning();
  return rows[0]!;
}

export async function getConversation(db: Database, id: string) {
  const rows = await db
    .select()
    .from(conversation)
    .where(eq(conversation.id, id));
  return rows[0] ?? null;
}

export async function listConversations(
  db: Database,
  workspaceId: string,
  userId: string
) {
  return db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.workspaceId, workspaceId),
        eq(conversation.userId, userId)
      )
    )
    .orderBy(desc(conversation.createdAt));
}

export async function listConversationsByAgent(
  db: Database,
  workspaceId: string,
  userId: string,
  agentId: string
) {
  return db
    .select({
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      agentId: conversation.agentId,
      userId: conversation.userId,
      title: conversation.title,
      createdAt: conversation.createdAt,
      messageCount: count(message.id).mapWith(Number),
    })
    .from(conversation)
    .leftJoin(message, eq(message.conversationId, conversation.id))
    .where(
      and(
        eq(conversation.workspaceId, workspaceId),
        eq(conversation.userId, userId),
        eq(conversation.agentId, agentId)
      )
    )
    .groupBy(conversation.id)
    .orderBy(desc(conversation.createdAt));
}

export async function updateConversationTitle(
  db: Database,
  id: string,
  title: string
) {
  const rows = await db
    .update(conversation)
    .set({ title })
    .where(and(eq(conversation.id, id), eq(conversation.title, "")))
    .returning();
  return rows[0] ?? null;
}

export async function deleteConversation(db: Database, id: string) {
  const rows = await db
    .delete(conversation)
    .where(eq(conversation.id, id))
    .returning();
  return rows[0] ?? null;
}
