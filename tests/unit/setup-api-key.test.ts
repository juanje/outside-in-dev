import { describe, expect, it } from "vitest";
import { fakeSetupSdk } from "./fake-setup-sdk.js";
import { runWithoutProject } from "./run-capture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

describe("oid setup --help", () => {
  it("shows its usage and its options, and the overview lists the command", async () => {
    const { exitCode, stdout, stderr } = await runWithoutProject(["setup", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("usage: oid setup [--provider P] [--login | --api-key-stdin] [--import-pi] [--model ROLE=provider/id]...");
    for (const option of ["--provider", "--login", "--api-key-stdin", "--import-pi", "--model"]) {
      expect(stdout).toMatch(new RegExp(`^\\s*${option}\\s{2,}\\S`, "m"));
    }
    expect((await runWithoutProject(["--help"])).stdout).toMatch(/^\s*setup\s{2,}\S/m);
  });
});

const KEY ="sk-unit-key-31337";

describe("oid setup --provider P --api-key-stdin", () => {
  it("logs in to the provider with the key read from standard input, without printing it", async () => {
    const { runSetup } = await import("../../src/commands/setup.js");
    const { sdk, calls } = fakeSetupSdk(["anthropic"]);
    let stdout = "";
    let stderr = "";
    const io = { cwd: "/nowhere", stdout: (text: string) => (stdout += text), stderr: (text: string) => (stderr += text) };
    const services = { configDir: "/scratch/config", agentDir: "/scratch/config/agent", piAgentDir: "/scratch/pi", input: { isTTY: false as const }, readStdin: async () => `${KEY}\n`, sdk };
    const exitCode = await runSetup(io, ["--provider", "anthropic", "--api-key-stdin"], services);
    expect(exitCode).toBe(0);
    expect(calls.logins).toEqual([{ provider: "anthropic", type: "api_key", prompted: [KEY] }]);
    expect(calls.created.at(-1)?.authPath).toBe("/scratch/config/agent/auth.json");
    expect((stdout + stderr).includes(KEY)).toBe(false);
    expect(stdout).toContain("anthropic");
  });

  it("asks for the key to be piped when standard input is a terminal", async () => {
    const { setup } = await import("./setup-fixture.js");
    await expect(setup(["--provider", "anthropic", "--api-key-stdin"], { readStdin: undefined })).rejects.toThrow("pipe the key");
  });

  it("refuses an empty key, saying there is no API key, and does not log in", async () => {
    const { setup } = await import("./setup-fixture.js");
    const { sdk, calls } = fakeSetupSdk(["anthropic"]);
    await expect(setup(["--provider", "anthropic", "--api-key-stdin"], { readStdin: async () => "  \n", sdk })).rejects.toThrow("no API key");
    expect(calls.logins).toEqual([]);
  });

  it("refuses a provider that is not in the catalogue, naming it, without reading the key", async () => {
    const { setup } = await import("./setup-fixture.js");
    let read = false;
    const rejected = setup(["--provider", "no-such-provider", "--api-key-stdin"], { readStdin: async () => ((read = true), KEY) });
    await expect(rejected).rejects.toThrow("no-such-provider");
    expect(read).toBe(false);
  });
});
