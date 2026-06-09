import type { BackoffConfig } from "./types.js";

/**
 * Compute the exponential backoff delay (in ms) for the Nth consecutive
 * failure. `attempt` is 1-based: attempt 1 → baseMs, attempt 2 → baseMs*factor,
 * capped at maxMs. Optional symmetric jitter spreads restarts so a fleet of
 * daemons that crash together don't reconnect in lockstep (thundering herd).
 *
 * Pure and deterministic when `rng` is supplied — used directly in unit tests.
 */
export function computeBackoffDelay(
  attempt: number,
  cfg: BackoffConfig,
  rng: () => number = Math.random,
): number {
  if (attempt <= 0) return 0;

  const raw = cfg.baseMs * Math.pow(cfg.factor, attempt - 1);
  const capped = Math.min(raw, cfg.maxMs);

  if (cfg.jitter <= 0) return Math.round(capped);

  const jitterRatio = Math.min(cfg.jitter, 1);
  // Symmetric jitter in [-jitterRatio, +jitterRatio] around the capped value.
  const delta = capped * jitterRatio * (rng() * 2 - 1);
  const jittered = capped + delta;
  return Math.max(0, Math.round(jittered));
}

export const DEFAULT_BACKOFF: BackoffConfig = {
  baseMs: 1000,
  factor: 2,
  maxMs: 60_000,
  jitter: 0.2,
};
