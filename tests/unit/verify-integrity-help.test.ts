import { describe, expect, it } from "vitest";
import { runWithoutProject as run } from "./run-capture.js";

describe("oid verify --help", () => {
  it("shows the usage of integrity and its --step option", async () => {
    const { stdout } = await run(["verify", "--help"]);
    expect(stdout).toContain("oid verify integrity [--step <step>]");
    expect(stdout).toContain("--step");
  });
});
