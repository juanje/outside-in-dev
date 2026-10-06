import { describe, expect, it } from "vitest";
import { runWithoutProject as run } from "./run-capture.js";

describe("oid verify --help", () => {
  it("shows the usage of green and what a failing Green is, in the exit codes", async () => {
    const { stdout } = await run(["verify", "--help"]);
    expect(stdout).toContain("oid verify green");
    expect(stdout).toContain("1  not a valid Red, a Green with problems, or a usage error");
  });
});
