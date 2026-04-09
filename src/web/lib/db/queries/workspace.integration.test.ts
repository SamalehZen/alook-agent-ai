import { afterAll, describe, it, expect } from "vitest";
import {
  getTestClient,
  getTestDb,
  withTestTransaction,
  seedUser,
  seedWorkspace,
  seedMember,
} from "../test-utils";
import { listWorkspaces } from "./workspace";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

describe("listWorkspaces", () => {
  it("returns only workspaces the user is a member of", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      const ws1 = await seedWorkspace(tx, { name: "Joined" });
      const ws2 = await seedWorkspace(tx, { name: "Not Joined" });

      // User is only a member of ws1
      await seedMember(tx, ws1.id, user.id);

      const result = await listWorkspaces(tx, user.id);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(ws1.id);
      expect(result[0].name).toBe("Joined");
    });
  });

  it("returns empty array for user with no memberships", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx);
      await seedWorkspace(tx); // exists but user isn't a member

      const result = await listWorkspaces(tx, user.id);
      expect(result).toEqual([]);
    });
  });
});
