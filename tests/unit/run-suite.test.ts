import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BDD_SCRIPT, UNIT_SCRIPT } from "./suite-scripts.js";
import { runSuite } from "../../src/orchestrator/suite.js";

describe("running the existing suite", () => {
  let cwd = "";
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "oid-suite-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  function suite(unit: string, bdd: string) {
    writeFileSync(join(cwd, "unit.cjs"), UNIT_SCRIPT(unit));
    writeFileSync(join(cwd, "bdd.cjs"), BDD_SCRIPT(bdd));
    return runSuite(cwd, { unit: "node unit.cjs", bdd: "node bdd.cjs" });
  }

  it("lists what failed in each runner from its structured report", () => {
    const result = suite("failed", "FAILED");
    expect(result.unit).toEqual(["unit tests/totals.test.ts > totals > adds: boom"]);
    expect(result.bdd).toEqual(["bdd features/pay.feature: Pay: I pay (FAILED)"]);
  });

  it("refuses a BDD runner that wrote no report, instead of taking it for green", () => {
    writeFileSync(join(cwd, "unit.cjs"), UNIT_SCRIPT("passed"));
    expect(() => runSuite(cwd, { unit: "node unit.cjs", bdd: "node -e 0" })).toThrow("the BDD runner wrote no report");
  });

  it("returns the reports it read, as the runners wrote them", () => {
    expect(suite("passed", "PASSED").reports).toEqual({ unit: expect.stringContaining('"fullName":"totals > adds"'), bdd: expect.stringContaining('"uri":"features/pay.feature"') });
  });
});
