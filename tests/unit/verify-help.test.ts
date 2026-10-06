import { describe, expect, it } from "vitest";
import { runWithoutProject as run } from "./run-capture.js";

describe("oid verify --help", () => {
  it("shows the usage of red with its --decide option, and the exit codes", async () => {
    const { exitCode, stdout, stderr } = await run(["verify", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain('usage: oid verify red "<test file> > <test name>" [--decide <class>]');
    expect(stdout).toMatch(/^\s*--decide\s{2,}\S/m);
    expect(stdout).toContain("2  needs a decision");
  });
});
