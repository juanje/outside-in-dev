import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createRecordingCommand } from "../../features/support/recording-command.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

/** Runs a command line through a shell, as a notification command is run. */
function run(line: string, env: Record<string, string> = {}) {
  return spawnSync(line, { shell: true, env: { ...process.env, ...env }, encoding: "utf8" });
}

describe("a recording command", () => {
  it("records the arguments and the named environment variables of a run", () => {
    const recorder = createRecordingCommand({ dir: `${dir}/with space`, env: ["OID_EVENT", "OID_MESSAGE"] });
    const result = run(`${recorder.command} one "two words"`, { OID_EVENT: "done", OID_MESSAGE: "all green", OID_OTHER: "x" });
    expect(result.status).toBe(0);
    expect(recorder.invocations()).toEqual([{ args: ["one", "two words"], env: { OID_EVENT: "done", OID_MESSAGE: "all green" } }]);
  });

  it("records two runs in order", () => {
    const recorder = createRecordingCommand({ dir, env: ["OID_EVENT"] });
    run(recorder.command, { OID_EVENT: "first" });
    run(recorder.command, { OID_EVENT: "second" });
    expect(recorder.invocations().map((i) => i.env.OID_EVENT)).toEqual(["first", "second"]);
  });

  it("reports no invocation when it never ran", () => {
    expect(createRecordingCommand({ dir }).invocations()).toEqual([]);
  });

  it("exits with the given code and still records the run", () => {
    const recorder = createRecordingCommand({ dir, exitCode: 3 });
    expect(run(`${recorder.command} x`).status).toBe(3);
    expect(recorder.invocations()).toEqual([{ args: ["x"], env: {} }]);
  });
});
