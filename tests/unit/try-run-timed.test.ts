import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTimed } from "../../src/artifacts/verify-runner.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("runTimed", () => {
  it("runs the command line in the project and returns its exit code and what it printed, without creating oid's directory of reports", () => {
    const run = runTimed(dir, "echo out; echo err >&2; exit 3");
    expect(run).toEqual({ exitCode: 3, stdout: "out\n", stderr: "err\n" });
    expect(existsSync(join(dir, ".outside-in"))).toBe(false);
  });
});
