import { describe, expect, it } from "vitest";
import { bddDryRunCommand } from "../../src/artifacts/verify-runner.js";

describe("bddDryRunCommand", () => {
  it("appends the location of the scenario, the dry run option and the message report option to the configured command", () => {
    expect(bddDryRunCommand("npx cucumber-js", { file: "features/a.feature", line: 12 }, "/tmp/oid-try/bdd.ndjson")).toBe("npx cucumber-js 'features/a.feature:12' --dry-run --format message:'/tmp/oid-try/bdd.ndjson'");
  });
});
