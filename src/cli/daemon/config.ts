import { hostname, homedir } from "os";
import { join } from "path";
import { isDev } from "../lib/env.js";

function parseDuration(s: string): number {
  if (!s) return 0;
  let total = 0;
  const regex = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g;
  let match;
  while ((match = regex.exec(s)) !== null) {
    const val = parseFloat(match[1]);
    switch (match[2]) {
      case "ns":
        total += val / 1e6;
        break;
      case "us":
      case "µs":
        total += val / 1e3;
        break;
      case "ms":
        total += val;
        break;
      case "s":
        total += val * 1000;
        break;
      case "m":
        total += val * 60000;
        break;
      case "h":
        total += val * 3600000;
        break;
    }
  }
  return total;
}

export interface DaemonConfig {
  serverURL: string;
  claudePath: string;
  codexPath: string;
  opencodePath: string;
  claudeModel: string;
  codexModel: string;
  opencodeModel: string;
  pollInterval: number;
  heartbeatInterval: number;
  agentTimeout: number;
  maxConcurrentTasks: number;
  daemonId: string;
  deviceName: string;
  runtimeName: string;
  workspacesRoot: string;
  keepEnvAfterTask: boolean;
  cliVersion: string;
}

export function loadDaemonConfig(profile?: string): DaemonConfig {
  const h = hostname();
  let daemonId = process.env.ALOOK_DAEMON_ID || h;
  if (profile && !daemonId.endsWith(`-${profile}`)) {
    daemonId = `${daemonId}-${profile}`;
  }

  let defaultRoot: string;
  if (isDev() && process.env.ALOOK_PROJECT_ROOT) {
    defaultRoot = join(process.env.ALOOK_PROJECT_ROOT, ".alook", "workspaces");
  } else {
    defaultRoot = join(
      homedir(),
      profile ? `alook_workspaces_${profile}` : "alook_workspaces",
    );
  }
  const workspacesRoot = process.env.ALOOK_WORKSPACES_ROOT || defaultRoot;

  return {
    serverURL: normalizeServerBaseURL(
      process.env.ALOOK_SERVER_URL || "https://alook.ai",
    ),
    claudePath: process.env.ALOOK_CLAUDE_PATH || "claude",
    codexPath: process.env.ALOOK_CODEX_PATH || "codex",
    opencodePath: process.env.ALOOK_OPENCODE_PATH || "opencode",
    claudeModel: process.env.ALOOK_CLAUDE_MODEL || "",
    codexModel: process.env.ALOOK_CODEX_MODEL || "",
    opencodeModel: process.env.ALOOK_OPENCODE_MODEL || "",
    pollInterval: parseDuration(
      process.env.ALOOK_DAEMON_POLL_INTERVAL || "3s",
    ),
    heartbeatInterval: parseDuration(
      process.env.ALOOK_DAEMON_HEARTBEAT_INTERVAL || "15s",
    ),
    agentTimeout: parseDuration(process.env.ALOOK_AGENT_TIMEOUT || "2h"),
    maxConcurrentTasks: parseInt(
      process.env.ALOOK_DAEMON_MAX_CONCURRENT_TASKS || "20",
    ),
    daemonId,
    deviceName: process.env.ALOOK_DAEMON_DEVICE_NAME || h,
    runtimeName: process.env.ALOOK_AGENT_RUNTIME_NAME || "Local Agent",
    workspacesRoot,
    keepEnvAfterTask: process.env.ALOOK_KEEP_ENV_AFTER_TASK === "true",
    cliVersion: "0.1.0",
  };
}

export function normalizeServerBaseURL(url: string): string {
  return url
    .replace(/^ws:\/\//, "http://")
    .replace(/^wss:\/\//, "https://")
    .replace(/\/ws$/, "");
}
