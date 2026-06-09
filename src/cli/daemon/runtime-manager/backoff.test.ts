import { describe, it, expect } from "vitest";
import { computeBackoffDelay, DEFAULT_BACKOFF } from "./backoff.js";
import type { BackoffConfig } from "./types.js";

const NO_JITTER: BackoffConfig = { baseMs: 1000, factor: 2, maxMs: 60_000, jitter: 0 };

describe("computeBackoffDelay", () => {
  it("returns 0 for non-positive attempts", () => {
    expect(computeBackoffDelay(0, NO_JITTER)).toBe(0);
    expect(computeBackoffDelay(-3, NO_JITTER)).toBe(0);
  });

  it("grows exponentially from baseMs", () => {
    expect(computeBackoffDelay(1, NO_JITTER)).toBe(1000);
    expect(computeBackoffDelay(2, NO_JITTER)).toBe(2000);
    expect(computeBackoffDelay(3, NO_JITTER)).toBe(4000);
    expect(computeBackoffDelay(4, NO_JITTER)).toBe(8000);
  });

  it("caps at maxMs", () => {
    expect(computeBackoffDelay(20, NO_JITTER)).toBe(60_000);
    expect(computeBackoffDelay(100, NO_JITTER)).toBe(60_000);
  });

  it("applies symmetric jitter within bounds", () => {
    const cfg: BackoffConfig = { baseMs: 1000, factor: 2, maxMs: 60_000, jitter: 0.5 };
    // rng=0 → -50%, rng=1 → +50%, rng=0.5 → no change
    expect(computeBackoffDelay(2, cfg, () => 0)).toBe(1000); // 2000 - 50%
    expect(computeBackoffDelay(2, cfg, () => 1)).toBe(3000); // 2000 + 50%
    expect(computeBackoffDelay(2, cfg, () => 0.5)).toBe(2000);
  });

  it("never returns a negative delay", () => {
    const cfg: BackoffConfig = { baseMs: 1000, factor: 2, maxMs: 60_000, jitter: 1 };
    for (let i = 1; i <= 10; i++) {
      expect(computeBackoffDelay(i, cfg, () => 0)).toBeGreaterThanOrEqual(0);
    }
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_BACKOFF.baseMs).toBe(1000);
    expect(DEFAULT_BACKOFF.factor).toBe(2);
    expect(DEFAULT_BACKOFF.maxMs).toBe(60_000);
  });
});
