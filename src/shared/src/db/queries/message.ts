import { eq, asc } from "drizzle-orm";
import { message } from "../schema";
import type { Database } from "../index";

export async function createMessage(
  db: Database,
  data: {
    conversationId: string;
    role: string;
    content: string;
    taskId?: string | null;
  }
) {
  const rows = await db
    .insert(message)
    .values({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      taskId: data.taskId ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function listMessages(db: Database, conversationId: string) {
  return db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt));
}

export async function getMessage(db: Database, id: string) {
  const rows = await db.select().from(message).where(eq(message.id, id));
  return rows[0] ?? null;
}
