import { Command } from "commander";
import { loadRuntimeManagerConfig } from "../daemon/runtime-manager/config.js";
import { RuntimeManager } from "../daemon/runtime-manager/manager.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger({ module: "runtime-manager" });

/**
 * Run the runtime-manager supervisor. When `once` is true it performs a single
 * reconcile pass and returns (useful for smoke tests / cron-style triggers);
 * otherwise it runs the reconcile + health loops until the process is signalled.
 */
export async function runRuntimeManager(opts: { once?: boolean } = {}): Promise<void> {
  const config = loadRuntimeManagerConfig();
  if (!config.secret) {
    log.error(
      "Missing runtime-manager secret. Set ALOOK_RUNTIME_MANAGER_SECRET (must match the web RUNTIME_MANAGER_SECRET).",
    );
    process.exitCode = 1;
    return;
  }

  const manager = new RuntimeManager({ config });

  if (opts.once) {
    await manager.reconcileOnce();
    for (const snap of manager.snapshots()) {
      log.info(
        `workspace ${snap.workspaceId}: state=${snap.state} pid=${snap.pid ?? "-"} port=${snap.healthPort} restarts=${snap.restarts}`,
      );
    }
    manager.stop();
    return;
  }

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal} — shutting down supervised daemons`);
    manager.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  await manager.start();
}

function printStatus(): void {
  const config = loadRuntimeManagerConfig();
  log.info("runtime-manager configuration:");
  log.info(`  server URL:        ${config.serverUrl}`);
  log.info(`  secret:            ${config.secret ? "set" : "MISSING"}`);
  log.info(`  reconcile every:   ${config.reconcileIntervalMs}ms`);
  log.info(`  health every:      ${config.healthIntervalMs}ms`);
  log.info(`  unhealthy after:   ${config.unhealthyThreshold} probes`);
  log.info(`  state dir:         ${config.baseDir}`);
  log.info(`  health ports:      ${config.healthPortBase}-${config.healthPortMax}`);
  if (!config.secret) {
    log.error("Set ALOOK_RUNTIME_MANAGER_SECRET before starting the supervisor.");
    process.exitCode = 1;
  }
}

export function runtimeManagerCommand(): Command {
  const cmd = new Command("runtime-manager").description(
    "Supervise managed agent runtimes (automatic, zero-touch provisioning)",
  );

  cmd
    .command("start")
    .description("Start the managed-runtime supervisor in the foreground")
    .option("--once", "Run a single reconcile pass and exit")
    .action(async (opts) => {
      await runRuntimeManager({ once: opts.once });
    });

  cmd
    .command("status")
    .description("Print the resolved runtime-manager configuration")
    .action(() => {
      printStatus();
    });

  return cmd;
}
