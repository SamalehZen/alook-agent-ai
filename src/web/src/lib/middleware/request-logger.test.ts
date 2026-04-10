import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logRequest } from "./request-logger";

 
let stdoutSpy: any;
 
let stderrSpy: any;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

 
function parseLines(spy: any): Record<string, unknown>[] {
  return spy.mock.calls.map((c: any) => JSON.parse(c[0] as string));
}

describe("logRequest", () => {
  it("logs info for 2xx status", () => {
    logRequest("GET", "/api/agents", 200, 15);
    const entries = parseLines(stdoutSpy);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "info",
      msg: "http request",
      method: "GET",
      path: "/api/agents",
      status: 200,
    });
  });

  it("logs warn for 4xx status", () => {
    logRequest("POST", "/api/agents", 400, 5);
    const entries = parseLines(stdoutSpy);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "warn",
      status: 400,
    });
  });

  it("logs error for 5xx status", () => {
    logRequest("GET", "/api/agents", 500, 100);
    const entries = parseLines(stderrSpy);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "error",
      status: 500,
    });
  });

  it("skips /health endpoint", () => {
    logRequest("GET", "/health", 200, 1);
    logRequest("GET", "/api/health", 200, 1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("includes requestId and userId when provided", () => {
    logRequest("GET", "/api/test", 200, 10, "req-1", "u1");
    const entries = parseLines(stdoutSpy);
    expect(entries[0]).toMatchObject({
      request_id: "req-1",
      user_id: "u1",
    });
  });
});
