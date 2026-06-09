import { describe, it, expect } from "vitest";
import { PortAllocator } from "./port-allocator.js";

describe("PortAllocator", () => {
  it("rejects an invalid range", () => {
    expect(() => new PortAllocator(100, 100)).toThrow(/invalid port range/);
    expect(() => new PortAllocator(200, 100)).toThrow(/invalid port range/);
  });

  it("allocates the lowest free port and is idempotent per workspace", () => {
    const alloc = new PortAllocator(19600, 19610);
    expect(alloc.allocate("a")).toBe(19600);
    expect(alloc.allocate("b")).toBe(19601);
    expect(alloc.allocate("a")).toBe(19600); // same workspace → same port
    expect(alloc.size).toBe(2);
  });

  it("recycles released ports", () => {
    const alloc = new PortAllocator(19600, 19610);
    alloc.allocate("a"); // 19600
    alloc.allocate("b"); // 19601
    alloc.release("a");
    expect(alloc.portFor("a")).toBeUndefined();
    // Lowest free port is now 19600 again.
    expect(alloc.allocate("c")).toBe(19600);
    expect(alloc.size).toBe(2);
  });

  it("throws when the range is exhausted", () => {
    const alloc = new PortAllocator(19600, 19602);
    alloc.allocate("a");
    alloc.allocate("b");
    expect(() => alloc.allocate("c")).toThrow(/exhausted/);
  });

  it("release of an unknown workspace is a no-op", () => {
    const alloc = new PortAllocator(19600, 19610);
    expect(() => alloc.release("nope")).not.toThrow();
  });
});
