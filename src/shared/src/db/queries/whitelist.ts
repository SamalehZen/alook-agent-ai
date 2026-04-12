import { eq, and } from "drizzle-orm";
import { agentWhitelist } from "../schema";
import type { Database } from "../index";

export async function getWhitelist(db: Database, agentId: string) {
  return db.select().from(agentWhitelist).where(eq(agentWhitelist.agentId, agentId));
}

export async function addWhitelist(db: Database, agentId: string, email: string) {
  const rows = await db
    .insert(agentWhitelist)
    .values({ agentId, email })
    .onConflictDoNothing()
    .returning();
  return rows[0] ?? null;
}

export async function removeWhitelist(db: Database, id: string) {
  await db.delete(agentWhitelist).where(eq(agentWhitelist.id, id));
}

export async function isWhitelisted(db: Database, agentId: string, email: string): Promise<boolean> {
  const rows = await db
    .select({ id: agentWhitelist.id })
    .from(agentWhitelist)
    .where(and(eq(agentWhitelist.agentId, agentId), eq(agentWhitelist.email, email)))
    .limit(1);
  return rows.length > 0;
}
