import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fakeSetupSdk } from "./fake-setup-sdk.js";
import { CATALOGUE } from "./setup-fixture.js";
import { output, scriptedTerminal } from "./scripted-terminal.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

/** The services of a user whose configuration directory is `config` in the temporary directory. */
function services(input: unknown) {
  const { sdk } = fakeSetupSdk(["anthropic"], CATALOGUE);
  return { configDir: join(dir, "config"), agentDir: join(dir, "config/agent"), piAgentDir: join(dir, "pi"), input: input as { isTTY: false }, sdk };
}

describe("oid init", () => {
  it("offers oid setup once the project is initialised, when it is given the services of the user", async () => {
    const { runCli } = await import("../../src/run-cli.js");
    write("tsconfig.json", "{}");
    const { io, text } = output();
    const exitCode = await runCli(["init"], { ...io, cwd: dir }, services({ isTTY: false }));
    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(true);
    expect(text()).toContain("run oid setup");
  });
});

describe("offerSetup", () => {
  it("says nothing without services, and nothing to a user who has set up the models", async () => {
    const { offerSetup } = await import("../../src/commands/setup.js");
    const none = output();
    await offerSetup(none.io, undefined);
    write("config/config.json", JSON.stringify({ models: { fast: "a/b", default: "a/b", strong: "a/b" } }));
    const set = output();
    await offerSetup(set.io, services({ isTTY: false }));
    expect([none.text(), set.text()]).toEqual(["", ""]);
  });

  it("only says how to set up when there is no terminal", async () => {
    const { offerSetup } = await import("../../src/commands/setup.js");
    const { io, text } = output();
    await offerSetup(io, services({ isTTY: false }));
    expect(text()).toContain("oid setup");
    expect(existsSync(join(dir, "config"))).toBe(false);
  });

  it("asks at a terminal, and sets up when the answer is yes", async () => {
    const { offerSetup } = await import("../../src/commands/setup.js");
    const terminal = scriptedTerminal(["yes", "", "anthropic/claude-haiku-4-5", "anthropic/claude-sonnet-4-5", "anthropic/claude-opus-5", ""]);
    await offerSetup(output().io, services(terminal));
    expect(terminal.asked[0]).toContain("Set up");
    expect(existsSync(join(dir, "config/config.json"))).toBe(true);
  });

  it("asks at a terminal, and only says how to set up when the answer is no", async () => {
    const { offerSetup } = await import("../../src/commands/setup.js");
    const terminal = scriptedTerminal(["no"]);
    const { io, text } = output();
    await offerSetup(io, services(terminal));
    expect(text()).toContain("oid setup");
    expect(existsSync(join(dir, "config"))).toBe(false);
  });
});
