import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLine(spy: any): Record<string, unknown> {
  const raw = spy.mock.calls[0][0] as string;
  return JSON.parse(raw);
}

describe("Logger", () => {
  it("outputs valid JSON with level, msg, ts fields", () => {
    const logger = new Logger("info");
    logger.info("hello");

    const entry = parseLine(stdoutSpy);
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("hello");
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes extra context fields in output", () => {
    const logger = new Logger("info");
    logger.info("task done", { taskId: "t1", duration: 42 });

    const entry = parseLine(stdoutSpy);
    expect(entry.taskId).toBe("t1");
    expect(entry.duration).toBe(42);
  });

  it("filters messages below configured level", () => {
    const logger = new Logger("warn");
    logger.debug("hidden");
    logger.info("hidden");
    logger.warn("visible");
    logger.error("visible");

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it("writes error to stderr, others to stdout", () => {
    const logger = new Logger("debug");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");

    expect(stdoutSpy).toHaveBeenCalledTimes(3);
    expect(stderrSpy).not.toHaveBeenCalled();

    logger.error("e");
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it("extracts error message from Error objects", () => {
    const logger = new Logger("error");
    logger.error("failed", { err: new Error("bad input") });

    const entry = parseLine(stderrSpy);
    expect(entry.err).toBe("bad input");
  });

  it("silent level suppresses all output", () => {
    const logger = new Logger("silent");
    logger.debug("nope");
    logger.info("nope");
    logger.warn("nope");
    logger.error("nope");

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
