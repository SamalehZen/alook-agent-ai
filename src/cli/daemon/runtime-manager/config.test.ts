import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { join } from "path";
import { homedir } from "os";
import { loadRuntimeManagerConfig, parseDurationMs } from "./config.js";

const KEYS = [
  "ALOOK_SERVER_URL",
  "ALOOK_RUNTIME_MANAGER_SECRET",
  "RUNTIME_MANAGER_SECRET",
  "ALOOK_RM_RECONCILE_INTERVAL",
  "ALOOK_RM_HEALTH_INTERVAL",
  "ALOOK_RM_UNHEALTHY_THRESHOLD",
  "ALOOK_RM_BASE_DIR",
  "ALOOK_RM_HEALTH_PORT_BASE",
  "ALOOK_RM_HEALTH_PORT_MAX",
  "ALOOK_RM_BACKOFF_BASE",
  "ALOOK_RM_BACKOFF_FACTOR",
  "ALOOK_RM_BACKOFF_MAX",
  "ALOOK_RM_BACKOFF_JITTER",
  "ALOOK_PROJECT_ROOT",
];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("parseDurationMs", () => {
  it("parses bare numbers as milliseconds", () => {
    expect(parseDurationMs("500", 0)).toBe(500);
  });
  it("parses unit suffixes", () => {
    expect(parseDurationMs("2s", 0)).toBe(2000);
    expect(parseDurationMs("3m", 0)).toBe(180_000);
    expect(parseDurationMs("250ms", 0)).toBe(250);
    expect(parseDurationMs("1h", 0)).toBe(3_600_000);
  });
  it("falls back on empty or invalid input", () => {
    expect(parseDurationMs(undefined, 42)).toBe(42);
    expect(parseDurationMs("", 42)).toBe(42);
    expect(parseDurationMs("nonsense", 42)).toBe(42);
  });
});

describe("loadRuntimeManagerConfig", () => {
  it("returns documented defaults", () => {
    const cfg = loadRuntimeManagerConfig({});
    expect(cfg.reconcileIntervalMs).toBe(15_000);
    expect(cfg.healthIntervalMs).toBe(30_000);
    expect(cfg.unhealthyThreshold).toBe(3);
    expect(cfg.healthPortBase).toBe(19600);
    expect(cfg.healthPortMax).toBe(19900);
    expect(cfg.baseDir).toBe(join(homedir(), ".alook", "managed"));
    expect(cfg.backoff).toEqual({ baseMs: 1000, factor: 2, maxMs: 60_000, jitter: 0.2 });
    expect(cfg.secret).toBe("");
  });

  it("prefers ALOOK_RUNTIME_MANAGER_SECRET over RUNTIME_MANAGER_SECRET", () => {
    expect(
      loadRuntimeManagerConfig({
        ALOOK_RUNTIME_MANAGER_SECRET: "a",
        RUNTIME_MANAGER_SECRET: "b",
      }).secret,
    ).toBe("a");
    expect(loadRuntimeManagerConfig({ RUNTIME_MANAGER_SECRET: "b" }).secret).toBe("b");
  });

  it("honors every override", () => {
    const cfg = loadRuntimeManagerConfig({
      ALOOK_RM_RECONCILE_INTERVAL: "5s",
      ALOOK_RM_HEALTH_INTERVAL: "10s",
      ALOOK_RM_UNHEALTHY_THRESHOLD: "5",
      ALOOK_RM_BASE_DIR: "/tmp/managed",
      ALOOK_RM_HEALTH_PORT_BASE: "20000",
      ALOOK_RM_HEALTH_PORT_MAX: "20100",
      ALOOK_RM_BACKOFF_BASE: "2s",
      ALOOK_RM_BACKOFF_FACTOR: "3",
      ALOOK_RM_BACKOFF_MAX: "120s",
      ALOOK_RM_BACKOFF_JITTER: "0.1",
    });
    expect(cfg.reconcileIntervalMs).toBe(5000);
    expect(cfg.healthIntervalMs).toBe(10_000);
    expect(cfg.unhealthyThreshold).toBe(5);
    expect(cfg.baseDir).toBe("/tmp/managed");
    expect(cfg.healthPortBase).toBe(20000);
    expect(cfg.healthPortMax).toBe(20100);
    expect(cfg.backoff).toEqual({ baseMs: 2000, factor: 3, maxMs: 120_000, jitter: 0.1 });
  });

  it("clamps unhealthyThreshold to at least 1", () => {
    expect(loadRuntimeManagerConfig({ ALOOK_RM_UNHEALTHY_THRESHOLD: "0" }).unhealthyThreshold).toBe(1);
  });

  it("normalizes the server URL from ALOOK_SERVER_URL", () => {
    process.env.ALOOK_SERVER_URL = "wss://example.com/ws";
    expect(loadRuntimeManagerConfig({}).serverUrl).toBe("https://example.com");
  });
});
