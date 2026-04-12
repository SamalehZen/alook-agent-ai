import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { getRequestId, setRequestIdHeader } from "./request-id";

describe("getRequestId", () => {
  it("returns X-Request-ID from header when present", () => {
    const req = new Request("http://localhost", {
      headers: { "X-Request-ID": "req-123" },
    });
    expect(getRequestId(req)).toBe("req-123");
  });

  it("generates UUID when header missing", () => {
    const req = new Request("http://localhost");
    const id = getRequestId(req);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("setRequestIdHeader", () => {
  it("adds X-Request-ID header to response", () => {
    const res = NextResponse.json({ ok: true });
    setRequestIdHeader(res, "req-456");
    expect(res.headers.get("X-Request-ID")).toBe("req-456");
  });
});
