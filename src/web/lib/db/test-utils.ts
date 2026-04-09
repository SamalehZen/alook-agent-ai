import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Database } from "./index";

const TEST_DATABASE_URL =
  process.env.DATABASE_TEST_URL ||
  "postgres://postgres:postgres@localhost:5432/alook_test?sslmode=disable";

/**
 * Creates a postgres client pointing at alook_test.
 * Caller must call `client.end()` in afterAll.
 */
export function getTestClient() {
  return postgres(TEST_DATABASE_URL);
}

/**
 * Wraps a postgres client in a Drizzle instance with schema.
 */
export function getTestDb(client: postgres.Sql) {
  return drizzle(client, { schema });
}

/**
 * Runs `fn(tx)` inside a transaction, always rolls back after.
 * Casts `tx` to `Database` for type compatibility with query functions.
 */
export async function withTestTransaction(
  db: ReturnType<typeof getTestDb>,
  fn: (tx: Database) => Promise<void>
) {
  await db
    .transaction(async (tx) => {
      await fn(tx as unknown as Database);
      // Always rollback — throw a sentinel error
      throw new RollbackError();
    })
    .catch((err) => {
      if (err instanceof RollbackError) return;
      throw err;
    });
}

class RollbackError extends Error {
  constructor() {
    super("__test_rollback__");
  }
}

// --------------- Fixture Factories ---------------

export async function seedUser(tx: Database, overrides?: { email?: string; name?: string }) {
  const rows = await (tx as any)
    .insert(schema.user)
    .values({
      email: overrides?.email ?? `test-${crypto.randomUUID()}@test.com`,
      name: overrides?.name ?? "Test User",
    })
    .returning();
  return rows[0]!;
}

export async function seedWorkspace(tx: Database, overrides?: { name?: string; slug?: string }) {
  const slug = overrides?.slug ?? `ws-${crypto.randomUUID().slice(0, 8)}`;
  const rows = await (tx as any)
    .insert(schema.workspace)
    .values({
      name: overrides?.name ?? "Test Workspace",
      slug,
    })
    .returning();
  return rows[0]!;
}

export async function seedMember(tx: Database, workspaceId: string, userId: string) {
  const rows = await (tx as any)
    .insert(schema.member)
    .values({ workspaceId, userId })
    .returning();
  return rows[0]!;
}

export async function seedRuntime(tx: Database, workspaceId: string) {
  const rows = await (tx as any)
    .insert(schema.agentRuntime)
    .values({
      workspaceId,
      daemonId: `daemon-${crypto.randomUUID().slice(0, 8)}`,
      provider: "test",
      name: "Test Runtime",
    })
    .returning();
  return rows[0]!;
}

export async function seedAgent(
  tx: Database,
  workspaceId: string,
  runtimeId: string,
  ownerId?: string
) {
  const rows = await (tx as any)
    .insert(schema.agent)
    .values({
      workspaceId,
      name: "Test Agent",
      runtimeId,
      ownerId: ownerId ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function seedConversation(
  tx: Database,
  workspaceId: string,
  agentId: string,
  userId: string,
  overrides?: { title?: string; createdAt?: Date }
) {
  const rows = await (tx as any)
    .insert(schema.conversation)
    .values({
      workspaceId,
      agentId,
      userId,
      title: overrides?.title ?? "",
      ...(overrides?.createdAt ? { createdAt: overrides.createdAt } : {}),
    })
    .returning();
  return rows[0]!;
}
