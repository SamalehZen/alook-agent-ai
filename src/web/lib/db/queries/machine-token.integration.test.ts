import { afterAll, describe, it, expect } from "vitest";
import {
  getTestClient,
  getTestDb,
  withTestTransaction,
  seedUser,
  seedWorkspace,
  seedMember,
} from "../test-utils";
import { createMachineToken, getMachineTokenByHash } from "./machine-token";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

describe("getMachineTokenByHash", () => {
  it("returns token with joined userEmail", async () => {
    await withTestTransaction(db, async (tx) => {
      const user = await seedUser(tx, { email: "token-user@example.com" });
      const ws = await seedWorkspace(tx);
      await seedMember(tx, ws.id, user.id);

      const token = await createMachineToken(tx, {
        userId: user.id,
        workspaceId: ws.id,
        tokenHash: "hash-abc-123",
        name: "My Token",
      });

      const result = await getMachineTokenByHash(tx, "hash-abc-123");
      expect(result).not.toBeNull();
      expect(result!.id).toBe(token.id);
      expect(result!.userEmail).toBe("token-user@example.com");
      expect(result!.name).toBe("My Token");
      expect(result!.workspaceId).toBe(ws.id);
    });
  });

  it("returns null for non-existent hash", async () => {
    await withTestTransaction(db, async (tx) => {
      const result = await getMachineTokenByHash(tx, "nonexistent-hash");
      expect(result).toBeNull();
    });
  });
});
