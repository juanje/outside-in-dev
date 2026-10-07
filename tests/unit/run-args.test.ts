import { describe, expect, it } from "vitest";
import { parseRunArgs } from "../../src/orchestrator/run-args.js";

describe("arguments of oid run", () => {
  it("reads the features, the limit and the branch name", () => {
    expect(parseRunArgs(["--fr", "FR-A-01", "FR-B-02", "--max-frs", "3", "--branch", "login"])).toEqual({ fr: ["FR-A-01", "FR-B-02"], maxFrs: 3, branch: "login" });
  });
});
