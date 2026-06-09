#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const serverUrl = process.env.ALOOK_SERVER_URL || "https://agents.hypeer.cloud";
const secret = process.env.RUNTIME_MANAGER_SECRET;
const stateDir = process.env.ALOOK_RUNTIME_MANAGER_STATE_DIR || "/var/lib/alook-runtime-manager";
const cliCommand = process.env.ALOOK_RUNTIME_CLI_CMD || "pnpm --filter @alook/cli dev -- daemon start --foreground";
const pollIntervalMs = Number(process.env.ALOOK_RUNTIME_MANAGER_POLL_MS || 30000);
const restartDelayMs = Number(process.env.ALOOK_RUNTIME_MANAGER_RESTART_MS || 5000);

if (!secret) {
  console.error("RUNTIME_MANAGER_SECRET is required");
  process.exit(1);
}

const children = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Runtime-Manager-Secret": secret,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${path} HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeDaemonConfig(workspaceId, token) {
  const root = join(stateDir, workspaceId);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const configPath = join(root, "config.json");
  const current = readJson(configPath) || {};
  const next = {
    ...current,
    server_url: serverUrl,
    watched_workspaces: [
      {
        id: workspaceId,
        name: "Managed",
        token,
        status: "active",
        agent_ids: [],
      },
    ],
  };
  writeFileSync(configPath, JSON.stringify(next, null, 2), { mode: 0o600 });
  return root;
}

async function provision(workspaceId) {
  const data = await request("/api/runtime-manager/provision", {
    method: "POST",
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  return data.token;
}

function startDaemon(workspaceId, token) {
  if (children.has(workspaceId)) return;

  const root = writeDaemonConfig(workspaceId, token);
  const daemonId = `managed_${workspaceId}`;
  const logPrefix = `[${daemonId}]`;
  const child = spawn(cliCommand, {
    shell: true,
    cwd: dirname(new URL(import.meta.url).pathname) + "/..",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ALOOK_PROJECT_ROOT: root,
      ALOOK_DAEMON_ID: daemonId,
      ALOOK_DAEMON_DEVICE_NAME: "Alook managed runtime",
      ALOOK_WORKSPACES_ROOT: join(root, "workspaces"),
      ALOOK_SERVER_URL: serverUrl,
    },
  });

  children.set(workspaceId, child);
  console.log(`${logPrefix} started pid=${child.pid}`);

  child.stdout.on("data", (buf) => process.stdout.write(`${logPrefix} ${buf}`));
  child.stderr.on("data", (buf) => process.stderr.write(`${logPrefix} ${buf}`));
  child.on("exit", (code, signal) => {
    children.delete(workspaceId);
    console.warn(`${logPrefix} exited code=${code ?? ""} signal=${signal ?? ""}`);
    setTimeout(() => {
      startDaemon(workspaceId, token);
    }, restartDelayMs).unref();
  });
}

async function reconcile() {
  const data = await request("/api/runtime-manager/managed-runtimes");
  const workspaceIds = [...new Set((data.runtimes || []).map((rt) => rt.workspaceId).filter(Boolean))];
  for (const workspaceId of workspaceIds) {
    if (children.has(workspaceId)) continue;
    const token = await provision(workspaceId);
    startDaemon(workspaceId, token);
  }
}

async function main() {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  console.log(`runtime-manager watching ${serverUrl}`);
  for (;;) {
    try {
      await reconcile();
    } catch (err) {
      console.error(`runtime-manager reconcile failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(pollIntervalMs);
  }
}

process.on("SIGTERM", () => {
  for (const child of children.values()) child.kill("SIGTERM");
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
