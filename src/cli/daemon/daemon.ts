import { DaemonClient } from "./client.js";
import { type DaemonConfig, loadDaemonConfig } from "./config.js";
import { createHealthServer } from "./health.js";
import { detectVersion } from "./agent/index.js";
import { type Task, type SessionRunnerInput, fromApiTask } from "./types.js";
import { loadCLIConfigForProfile, saveCLIConfigForProfile } from "../lib/config.js";
import { log } from "../lib/logger.js";
import { cmdPrefix } from "../lib/env.js";
import { acquireDaemonPid, releaseDaemonPid } from "./pidfile.js";
import { execSync, spawn, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

interface WorkspaceState {
  workspaceId: string;
  token: string;
  runtimeIds: string[];
}

interface RuntimeData {
  id: string;
  workspaceId: string;
  provider: string;
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function startDaemon(
  profile?: string,
  serverUrl?: string,
): Promise<void> {
  if (!acquireDaemonPid(profile)) {
    process.exit(1);
  }

  const config = loadDaemonConfig(profile);
  if (serverUrl) config.serverURL = serverUrl;

  const cliConfig = loadCLIConfigForProfile(profile);

  const workspaces = cliConfig.watched_workspaces || [];
  if (workspaces.length === 0) {
    log.error("No watched workspaces configured.");
    process.exit(1);
  }

  // Validate: each workspace must have its own token
  const hasPerWorkspaceTokens = workspaces.every((ws) => !!ws.token);
  if (!hasPerWorkspaceTokens) {
    log.error(
      `Config uses old format. Run '${cmdPrefix()} register --token <token>' for each workspace to upgrade.`,
    );
    process.exit(1);
  }

  // Use server_url from first workspace's config if available
  if (cliConfig.server_url) config.serverURL = cliConfig.server_url;

  const client = new DaemonClient(config.serverURL);
  const health = createHealthServer();

  const providers: { type: string; path: string; version: string }[] = [];
  for (const [type, path] of [
    ["claude", config.claudePath],
    ["codex", config.codexPath],
    ["opencode", config.opencodePath],
  ] as const) {
    if (isCommandAvailable(path)) {
      const version = await detectVersion(path);
      providers.push({ type, path, version });
    }
  }

  if (providers.length === 0) {
    log.error("No agent CLI tools found on PATH.");
    process.exit(1);
  }

  log.info(
    `Detected providers: ${providers.map((p) => `${p.type}@${p.version}`).join(", ")}`,
  );

  const workspaceStates: WorkspaceState[] = [];
  const runtimeIndex = new Map<string, RuntimeData>();

  for (const ws of workspaces) {
    const runtimes = providers.map((p) => ({
      name: config.runtimeName || `${p.type} (${config.deviceName})`,
      type: p.type,
      version: p.version,
    }));

    log.info(`Registering workspace ${ws.id} (${ws.name ?? "unnamed"}) with ${runtimes.length} runtime(s)...`);
    let resp;
    try {
      resp = await client.register(ws.token, {
        workspace_id: ws.id,
        daemon_id: config.daemonId,
        device_name: config.deviceName,
        cli_version: config.cliVersion,
        runtimes,
      });
    } catch (e) {
      log.error(`Failed to register workspace ${ws.id}, skipping`, e);
      continue;
    }
    log.info(`Workspace ${ws.id} registered — ${resp.runtimes.length} runtime(s)`);

    const runtimeIds = resp.runtimes.map((r: { id: string }) => r.id);
    workspaceStates.push({ workspaceId: ws.id, token: ws.token, runtimeIds });

    for (let i = 0; i < runtimeIds.length; i++) {
      runtimeIndex.set(runtimeIds[i], {
        id: runtimeIds[i],
        workspaceId: ws.id,
        provider: providers[i].type,
      });
    }
  }

  if (workspaceStates.length === 0) {
    log.error("No workspaces registered successfully.");
    process.exit(1);
  }

  const allRuntimeIds = workspaceStates.flatMap((ws) => ws.runtimeIds);
  health.setRuntimeCount(allRuntimeIds.length);
  log.info(
    `Daemon started — ${allRuntimeIds.length} runtime(s) across ${workspaceStates.length} workspace(s)`,
  );

  const activeTasks = new Set<string>();

  // Seed known agent IDs from config so we only write on genuinely new ones
  const knownAgentIds = new Set<string>(
    workspaces.flatMap((ws) => ws.agent_ids ?? []),
  );

  function syncAgentId(agentId: string, workspaceId: string): void {
    if (knownAgentIds.has(agentId)) return;
    knownAgentIds.add(agentId);
    try {
      const cfg = loadCLIConfigForProfile(profile);
      const ws = cfg.watched_workspaces?.find((w) => w.id === workspaceId);
      if (!ws) return;
      if (!ws.agent_ids) ws.agent_ids = [];
      if (!ws.agent_ids.includes(agentId)) {
        ws.agent_ids.push(agentId);
        saveCLIConfigForProfile(profile, cfg);
      }
    } catch {
      // Non-fatal — config sync is best-effort
    }
  }

  // Staggered per-workspace polling
  const pollCycle = async () => {
    let remaining = config.maxConcurrentTasks - activeTasks.size;
    if (remaining <= 0) return;

    const N = workspaceStates.length;
    const staggerMs = N > 1 ? Math.floor(config.pollInterval / N) : 0;

    for (let i = 0; i < N; i++) {
      if (remaining <= 0) break;
      const ws = workspaceStates[i];

      if (i > 0 && staggerMs > 0) {
        await new Promise((r) => setTimeout(r, staggerMs));
      }

      try {
        const tasks = await client.poll(ws.token, config.daemonId, remaining);
        for (const apiTask of tasks) {
          const task = fromApiTask(apiTask);
          syncAgentId(task.agentId, ws.workspaceId);
          activeTasks.add(task.id);
          remaining--;
          handleTask(client, config, runtimeIndex, task, ws.token, activeTasks)
            .catch((e) => {
              log.error("Task error", e);
              activeTasks.delete(task.id);
            });
        }
      } catch (e) {
        log.debug("Poll error", e);
      }
    }
  };

  const pollTimer = setInterval(pollCycle, config.pollInterval);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("Shutting down...");
    clearInterval(pollTimer);
    const shutdownMs = Number(process.env.ALOOK_SHUTDOWN_TIMEOUT_MS) || 5000;
    const timeout = setTimeout(() => process.exit(1), shutdownMs);
    try {
      for (const ws of workspaceStates) {
        await client.deregister(ws.token, config.daemonId);
      }
    } catch {
      // best-effort deregister
    }
    clearTimeout(timeout);
    releaseDaemonPid(profile);
    health.server.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await pollCycle();
}

const SESSION_RUNNER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "session-runner.ts",
);

export function spawnSessionRunner(input: SessionRunnerInput): ChildProcess {
  const encoded = Buffer.from(JSON.stringify(input)).toString("base64");
  const child = spawn("bun", ["run", SESSION_RUNNER_PATH, encoded], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child;
}

async function handleTask(
  client: DaemonClient,
  config: DaemonConfig,
  runtimeIndex: Map<string, RuntimeData>,
  task: Task,
  token: string,
  activeTasks: Set<string>,
): Promise<void> {
  log.info(`Task ${task.id} claimed agent=${task.agentId}`);

  try {
    await client.startTask(token, task.id);
  } catch (e) {
    await client.failTask(token, task.id, `start failed: ${e}`);
    activeTasks.delete(task.id);
    return;
  }

  // Resolve provider-specific CLI path and model
  const runtimeData = runtimeIndex.get(task.runtimeId);
  if (!runtimeData) {
    await client.failTask(token, task.id, `unknown runtime: ${task.runtimeId}`);
    activeTasks.delete(task.id);
    return;
  }

  const provider = runtimeData.provider;
  const cliPath =
    provider === "claude"
      ? config.claudePath
      : provider === "codex"
        ? config.codexPath
        : config.opencodePath;
  const model =
    provider === "claude"
      ? config.claudeModel
      : provider === "codex"
        ? config.codexModel
        : config.opencodeModel;

  const input: SessionRunnerInput = {
    task,
    provider,
    cliPath,
    model,
    serverURL: config.serverURL,
    token,
    workspacesRoot: config.workspacesRoot,
    agentTimeout: config.agentTimeout,
  };

  const child = spawnSessionRunner(input);
  child.on("close", () => activeTasks.delete(task.id));
  log.info(`Task ${task.id} dispatched to session-runner (pid=${child.pid})`);
}
