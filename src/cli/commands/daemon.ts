import { Command } from "commander";
import { startDaemon } from "../daemon/daemon.js";
import { cmdPrefix } from "../lib/env.js";

export function daemonCommand(): Command {
  const cmd = new Command("daemon").description("Manage the Alook daemon");

  cmd
    .command("start")
    .description("Start the daemon")
    .option("--foreground", "Run in foreground")
    .option("--server <url>", "Server URL override")
    .action(async (opts, command) => {
      const parentOpts = command.parent?.parent?.opts() || {};
      const profile: string | undefined = parentOpts.profile;
      const serverUrl: string | undefined =
        opts.server || parentOpts.server;

      if (!opts.foreground) {
        console.log(
          `Hint: run '${cmdPrefix()} daemon start --foreground' to start the daemon in the foreground.`,
        );
        return;
      }

      await startDaemon(profile, serverUrl);
    });

  cmd
    .command("status")
    .description("Show daemon status")
    .action(() => {
      const port = process.env.ALOOK_HEALTH_PORT || "19514";
      console.log(`check http://localhost:${port}/health`);
    });

  return cmd;
}
