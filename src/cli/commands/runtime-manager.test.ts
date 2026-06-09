import { describe, it, expect, afterEach } from "vitest";
import { runtimeManagerCommand, runRuntimeManager } from "./runtime-manager.js";

const SECRET_KEYS = ["ALOOK_RUNTIME_MANAGER_SECRET", "RUNTIME_MANAGER_SECRET"];

afterEach(() => {
  for (const k of SECRET_KEYS) delete process.env[k];
  process.exitCode = undefined;
});

describe("runtimeManagerCommand", () => {
  it("exposes start and status subcommands", () => {
    const cmd = runtimeManagerCommand();
    expect(cmd.name()).toBe("runtime-manager");
    const names = cmd.commands.map((c) => c.name()).sort();
    expect(names).toEqual(["start", "status"]);
  });

  it("declares the --once flag on start", () => {
    const cmd = runtimeManagerCommand();
    const start = cmd.commands.find((c) => c.name() === "start")!;
    const flags = start.options.map((o) => o.long);
    expect(flags).toContain("--once");
  });
});

describe("runRuntimeManager", () => {
  it("refuses to start without a secret and signals failure", async () => {
    for (const k of SECRET_KEYS) delete process.env[k];
    await runRuntimeManager({ once: true });
    expect(process.exitCode).toBe(1);
  });
});
