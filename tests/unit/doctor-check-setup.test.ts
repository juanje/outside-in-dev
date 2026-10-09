import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PiSdk } from "../../src/agents/runner.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

/** A Pi SDK whose runtime holds the models `anthropic/claude-haiku-4-5` and `anthropic/claude-sonnet-4-5`, has a credential for `keyed` providers only, and records the options it was created with. */
function sdkWith(keyed: string[]): { sdk: PiSdk; created: Record<string, unknown>[] } {
  const created: Record<string, unknown>[] = [];
  const known = ["claude-haiku-4-5", "claude-sonnet-4-5"];
  const runtime = {
    getModel: (provider: string, id: string) => (provider === "anthropic" && known.includes(id) ? { provider, id } : undefined),
    checkAuth: async (provider: string) => (keyed.includes(provider) ? { source: "auth.json", type: "api_key" } : undefined),
  };
  const sdk = { ModelRuntime: { create: async (options: Record<string, unknown>) => (created.push(options), runtime) } } as unknown as PiSdk;
  return { sdk, created };
}

describe("checkSetup with a connection", () => {
  it("calls only the providers that have a credential, with a runtime on the auth file when there is one, and hides the key the call used", async () => {
    const { checkSetup } = await import("../../src/commands/doctor.js");
    const created: Record<string, unknown>[] = [];
    const called: string[] = [];
    const runtime = {
      getModel: (provider: string, id: string) => ({ provider, id }),
      checkAuth: async (provider: string) => (provider === "anthropic" ? { source: "auth.json" } : undefined),
      getAuth: async () => ({ auth: { apiKey: "sk-live-1" } }),
      completeSimple: async (model: { provider: string }) => (called.push(model.provider), { stopReason: "error", errorMessage: "bad key sk-live-1" }),
    };
    const sdk = { ModelRuntime: { create: async (options: Record<string, unknown>) => (created.push(options), runtime) } } as unknown as PiSdk;
    write("config/config.json", JSON.stringify({ models: { fast: "anthropic/a", default: "anthropic/b", strong: "anthropic/c", spec: "openrouter/d" } }));
    write("config/agent/auth.json", JSON.stringify({ anthropic: { type: "api_key", key: "sk-live-1" } }));
    const checks = await checkSetup(dir, { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), sdk }, { connect: true });
    expect(called).toEqual(["anthropic"]);
    expect(checks.filter(({ subject }) => subject.startsWith("connect"))).toEqual([{ status: "failed", subject: "connect anthropic", note: "bad key [hidden]" }]);
    expect(created.at(-1)).toHaveProperty("authPath", join(dir, "config/agent/auth.json"));
  });
});

describe("checkSetup of a configuration written by hand", () => {
  it("reports the roles a configuration leaves without a model instead of failing on it", async () => {
    const { checkSetup } = await import("../../src/commands/doctor.js");
    write("config/config.json", JSON.stringify({ models: { fast: "anthropic/claude-haiku-4-5" } }));
    const checks = await checkSetup(dir, { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), sdk: sdkWith(["anthropic"]).sdk }, { connect: false });
    const models = checks.filter(({ subject }) => subject.startsWith("model")).map(({ status, subject }) => `${status}: ${subject}`);
    expect(models).toEqual(["ok: model fast", "missing: model default", "missing: model strong"]);
  });
});

describe("runDoctor", () => {
  it("prints one line for each check and exits 1 when one is not ok, and 0 when all are", async () => {
    const { runDoctor } = await import("../../src/commands/doctor.js");
    write("config/config.json", JSON.stringify({ models: { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-sonnet-4-5" } }));
    writeMinimalConfig({ commands: { bdd: "git", unit: "git", typecheck: "git", format: null, lint: null, coverage: null, extra_checks: [] } });
    const run = async (keyed: string[], args: string[]) => {
      let stdout = "";
      const exitCode = await runDoctor({ cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined }, args, { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), sdk: sdkWith(keyed).sdk });
      return { exitCode, lines: stdout.trimEnd().split("\n") };
    };
    expect(await run(["anthropic"], [])).toEqual({ exitCode: 0, lines: ["ok: project: .outside-in.json", "ok: tool git", "ok: model fast: anthropic/claude-haiku-4-5", "ok: model default: anthropic/claude-sonnet-4-5", "ok: model strong: anthropic/claude-sonnet-4-5", "ok: credential for anthropic: auth.json"] });
    const refused = await run([], []);
    expect(refused.exitCode).toBe(1);
    expect(refused.lines.at(-1)).toMatch(/^missing: credential for anthropic: run oid setup --provider anthropic/);
  });
});

describe("requireSetup", () => {
  it("does nothing without services to check, and refuses with every check that is not ok, each with its fix, and never the ones that are", async () => {
    const { requireSetup } = await import("../../src/orchestrator/preflight.js");
    const { ProgressError } = await import("../../src/artifacts/progress.js");
    await expect(requireSetup(dir, undefined)).resolves.toBeUndefined();
    write("config/config.json", JSON.stringify({ models: { fast: "anthropic/claude-haiku-4-5" } }));
    const refusal = requireSetup(dir, { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), sdk: sdkWith([]).sdk });
    await expect(refusal).rejects.toBeInstanceOf(ProgressError);
    const message = await refusal.then(
      () => "",
      (error: Error) => error.message,
    );
    expect(message.split("\n").map((line) => line.trim().split(":", 2).join(":"))).toEqual(expect.arrayContaining(["missing: project", "missing: model default", "missing: model strong", "missing: credential for anthropic"]));
    expect(message).toContain("run oid init");
    expect(message).not.toContain("ok:");
  });
});

describe("oid doctor on the command line", () => {
  it("is a command with its own help, and runs with the services it is given", async () => {
    const { runCli } = await import("../../src/run-cli.js");
    let stdout = "";
    const io = { cwd: dir, stdout: (text: string) => (stdout += text), stderr: () => undefined };
    expect(await runCli(["doctor", "--help"], io)).toBe(0);
    expect(stdout).toContain("usage: oid doctor [--connect]");
    stdout = "";
    const services = { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), sdk: sdkWith([]).sdk };
    expect(await runCli(["doctor"], io, services)).toBe(1);
    expect(stdout).toContain("missing: project");
  });
});

describe("checkSetup of a project", () => {
  it("checks the tool of each configured command after the project, naming the configuration file for a tool that is missing", async () => {
    const { checkSetup } = await import("../../src/commands/doctor.js");
    writeMinimalConfig({ commands: { bdd: "no-such-bdd-tool", unit: "git status", typecheck: "no-such-tsc-tool", format: null, lint: null, coverage: null, extra_checks: [] } });
    const checks = await checkSetup(dir, { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), sdk: sdkWith([]).sdk }, { connect: false });
    expect(checks.slice(0, 4).map(({ status, subject }) => `${status}: ${subject}`)).toEqual(["ok: project", "ok: tool git", "missing: tool no-such-bdd-tool", "missing: tool no-such-tsc-tool"]);
    expect(checks[2]!.note).toContain(".outside-in.json");
  });
});

describe("checkSetup", () => {
  it("reports a missing project configuration with oid init, still checks the user's setup, and opens Pi's runtime without an auth file path", async () => {
    const { checkSetup } = await import("../../src/commands/doctor.js");
    const { sdk, created } = sdkWith(["anthropic"]);
    write("config/config.json", JSON.stringify({ models: { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-sonnet-4-5" } }));
    const checks = await checkSetup(dir, { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), sdk }, { connect: false });
    expect(checks.map(({ status, subject }) => `${status}: ${subject}`)).toEqual(["missing: project", "ok: model fast", "ok: model default", "ok: model strong", "ok: credential for anthropic"]);
    expect(checks[0]!.note).toContain("oid init");
    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty("authPath");
    expect(created[0]).toHaveProperty("credentials");
  });
});
