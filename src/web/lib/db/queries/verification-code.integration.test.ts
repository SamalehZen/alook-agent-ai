import { afterAll, describe, it, expect } from "vitest";
import {
  getTestClient,
  getTestDb,
  withTestTransaction,
} from "../test-utils";
import {
  createVerificationCode,
  getLatestVerificationCode,
  incrementVerificationCodeAttempts,
} from "./verification-code";

const client = getTestClient();
const db = getTestDb(client);

afterAll(async () => {
  await client.end();
});

describe("getLatestVerificationCode", () => {
  it("returns valid code (unused, unexpired, under attempt limit)", async () => {
    await withTestTransaction(db, async (tx) => {
      const code = await createVerificationCode(tx, {
        email: "test@example.com",
        code: "123456",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min from now
      });

      const result = await getLatestVerificationCode(tx, "test@example.com");
      expect(result).not.toBeNull();
      expect(result!.id).toBe(code.id);
      expect(result!.code).toBe("123456");
    });
  });

  it("returns null for used code", async () => {
    await withTestTransaction(db, async (tx) => {
      const { markVerificationCodeUsed } = await import("./verification-code");

      await createVerificationCode(tx, {
        email: "used@example.com",
        code: "111111",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const fetched = await getLatestVerificationCode(tx, "used@example.com");
      await markVerificationCodeUsed(tx, fetched!.id);

      const result = await getLatestVerificationCode(tx, "used@example.com");
      expect(result).toBeNull();
    });
  });

  it("returns null for expired code", async () => {
    await withTestTransaction(db, async (tx) => {
      await createVerificationCode(tx, {
        email: "expired@example.com",
        code: "222222",
        expiresAt: new Date(Date.now() - 1000), // already expired
      });

      const result = await getLatestVerificationCode(tx, "expired@example.com");
      expect(result).toBeNull();
    });
  });

  it("returns null for code at attempt limit", async () => {
    await withTestTransaction(db, async (tx) => {
      const code = await createVerificationCode(tx, {
        email: "maxed@example.com",
        code: "333333",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // Increment attempts to 5 (the limit)
      for (let i = 0; i < 5; i++) {
        await incrementVerificationCodeAttempts(tx, code.id);
      }

      const result = await getLatestVerificationCode(tx, "maxed@example.com");
      expect(result).toBeNull();
    });
  });
});

describe("incrementVerificationCodeAttempts", () => {
  it("atomically increments the attempts counter", async () => {
    await withTestTransaction(db, async (tx) => {
      const { getLatestCodeByEmail } = await import("./verification-code");

      const code = await createVerificationCode(tx, {
        email: "inc@example.com",
        code: "444444",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      expect(code.attempts).toBe(0);

      await incrementVerificationCodeAttempts(tx, code.id);
      await incrementVerificationCodeAttempts(tx, code.id);
      await incrementVerificationCodeAttempts(tx, code.id);

      const fetched = await getLatestCodeByEmail(tx, "inc@example.com");
      expect(fetched!.attempts).toBe(3);
    });
  });
});
