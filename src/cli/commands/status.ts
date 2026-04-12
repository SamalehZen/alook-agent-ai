import { Command } from "commander";
import { loadCLIConfigForProfile } from "../lib/config.js";
import { cmdPrefix } from "../lib/env.js";

export function statusCommand(): Command {
  const cmd = new Command("status")
    .description("Show registration status")
    .action((_opts, command) => {
      const profile: string | undefined = command.parent?.opts().profile;
      const cfg = loadCLIConfigForProfile(profile);

      if (!cfg.token) {
        console.log("Not registered");
        console.log(
          `Run '${cmdPrefix()} register --token <token>' to register.`,
        );
        return;
      }

      console.log("Status: Registered");
      console.log(`Server: ${cfg.server_url}`);
      if (cfg.watched_workspaces.length > 0) {
        const ws = cfg.watched_workspaces[0];
        console.log(`Workspace: ${ws.name} (${ws.id})`);
      }
    });

  return cmd;
}
