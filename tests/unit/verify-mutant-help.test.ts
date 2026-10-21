import { describe, expect, it } from "vitest";
import { runWithoutProject as run } from "./run-capture.js";

describe("oid verify --help mutant", () => {
  it("shows the usage of --mutant for a test and for a scenario, and describes the option", async () => {
    const { exitCode, stdout } = await run(["verify", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('oid verify red "<test file> > <test name>" --mutant <file|->');
    expect(stdout).toContain("oid verify red <feature file>:<line> --mutant <file|->");
    expect(stdout).toMatch(/^\s*--mutant\s{2,}\S/m);
  });
});
