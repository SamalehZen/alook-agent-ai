import { join } from "path";
import { configDir } from "../../lib/config.js";
import { getServerUrl } from "../../lib/env.js";
import { normalizeServerBaseURL } from "../config.js";
import { DEFAULT_BACKOFF } from "./backoff.js";
import type { RuntimeManagerConfig } from "./types.js";

/**
 * Parse a duration string like "15s", "2m", "500ms" or a bare number (ms).
 * Returns `fallback` when the input is empty/invalid.
 */
export function parseDurationMs(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const m = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!m) return fallback;
  const val = parseFloat(m[1]);
  switch (m[2]) {
    case "ms":
      return Math.round(val);
    case "s":
      return Math.round(val * 1000);
    case "m":
      return Math.round(val * 60_000);
    case "h":
      return Math.round(val * 3_600_000);
    default:
      return fallback;
  }
}

function parseNumber(input: string | undefined, fallback: number): number {
  if (!input) return fallback;
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build the runtime-manager configuration from the environment. The shared
 * secret resolves from `ALOOK_RUNTIME_MANAGER_SECRET` first, then the
 * server-side `RUNTIME_MANAGER_SECRET` name for convenience when both run on
 * the same host.
 */
export function loadRuntimeManagerConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeManagerConfig {
  const secret =
    env.ALOOK_RUNTIME_MANAGER_SECRET || env.RUNTIME_MANAGER_SECRET || "";

  return {
    serverUrl: normalizeServerBaseURL(getServerUrl()),
    secret,
    reconcileIntervalMs: parseDurationMs(env.ALOOK_RM_RECONCILE_INTERVAL, 15_000),
    healthIntervalMs: parseDurationMs(env.ALOOK_RM_HEALTH_INTERVAL, 30_000),
    unhealthyThreshold: Math.max(1, parseNumber(env.ALOOK_RM_UNHEALTHY_THRESHOLD, 3)),
    baseDir: env.ALOOK_RM_BASE_DIR || join(configDir(), "managed"),
    healthPortBase: parseNumber(env.ALOOK_RM_HEALTH_PORT_BASE, 19600),
    healthPortMax: parseNumber(env.ALOOK_RM_HEALTH_PORT_MAX, 19900),
    backoff: {
      baseMs: parseDurationMs(env.ALOOK_RM_BACKOFF_BASE, DEFAULT_BACKOFF.baseMs),
      factor: parseNumber(env.ALOOK_RM_BACKOFF_FACTOR, DEFAULT_BACKOFF.factor),
      maxMs: parseDurationMs(env.ALOOK_RM_BACKOFF_MAX, DEFAULT_BACKOFF.maxMs),
      jitter: parseNumber(env.ALOOK_RM_BACKOFF_JITTER, DEFAULT_BACKOFF.jitter),
    },
  };
}
