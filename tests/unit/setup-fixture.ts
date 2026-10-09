import { join } from "node:path";
import type { SetupServices } from "../../src/commands/setup.js";
import { fakeSetupSdk, type SetupCalls } from "./fake-setup-sdk.js";
import { dir } from "./temp-project.js";

export const CATALOGUE = ["anthropic/claude-haiku-4-5", "anthropic/claude-sonnet-4-5", "anthropic/claude-opus-5", "openrouter/anthropic/claude-opus-5"];

/** Runs `oid setup` in the temporary directory as a user with the providers `anthropic` and `openrouter` and `CATALOGUE`; `services` replaces parts of what it is given. */
export async function setup(args: string[], services: Partial<SetupServices> = {}): Promise<{ exitCode: number; stdout: string; stderr: string; calls: SetupCalls; configDir: string; agentDir: string }> {
  const { runSetup } = await import("../../src/commands/setup.js");
  const { sdk, calls } = fakeSetupSdk(["anthropic", "openrouter"], CATALOGUE);
  let stdout = "";
  let stderr = "";
  const io = { cwd: dir, stdout: (text: string) => (stdout += text), stderr: (text: string) => (stderr += text) };
  const configDir = join(dir, "config");
  const agentDir = join(configDir, "agent");
  const exitCode = await runSetup(io, args, { configDir, agentDir, piAgentDir: join(dir, "pi"), input: { isTTY: false }, sdk, ...services });
  return { exitCode, stdout, stderr, calls, configDir, agentDir };
}
