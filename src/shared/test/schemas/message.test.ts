import { describe, it, expect } from "vitest";
import { CreateMessageRequestSchema } from "../../src/schemas";

describe("CreateMessageRequestSchema", () => {
  it("TC1: accepts content with quote metadata", () => {
    const result = CreateMessageRequestSchema.safeParse({
      content: "Can you fix this?",
      metadata: { quote: { messageId: "msg_123", excerpt: "The auth module has a bug" } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toEqual({
        quote: { messageId: "msg_123", excerpt: "The auth module has a bug" },
      });
    }
  });

  it("TC1: accepts content without metadata", () => {
    const result = CreateMessageRequestSchema.safeParse({ content: "Hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metadata).toBeUndefined();
    }
  });

  it("TC1: rejects empty content", () => {
    const result = CreateMessageRequestSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("TC1: rejects missing content", () => {
    const result = CreateMessageRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("TC1: metadata is optional", () => {
    const result = CreateMessageRequestSchema.safeParse({ content: "hi" });
    expect(result.success).toBe(true);
  });
});
