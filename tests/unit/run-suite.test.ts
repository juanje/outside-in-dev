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

  function suite(unit: string, bdd: string, ending: { unit?: string; bdd?: string } = {}, commands = { unit: "node unit.cjs", bdd: "node bdd.cjs" }) {
    writeFileSync(join(cwd, "unit.cjs"), UNIT_SCRIPT(unit) + (ending.unit ?? ""));
    writeFileSync(join(cwd, "bdd.cjs"), BDD_SCRIPT(bdd) + (ending.bdd ?? ""));
    return runSuite(cwd, commands);
  }

  it("lists what failed in each runner from its structured report", () => {
    const result = suite("failed", "FAILED");
    expect(result.unit).toEqual(["unit tests/totals.test.ts > totals > adds: boom"]);
    expect(result.bdd).toEqual(["bdd features/pay.feature: Pay: I pay (FAILED)"]);
  });

  it("refuses a BDD runner that wrote no report, instead of taking it for green", () => {
    writeFileSync(join(cwd, "unit.cjs"), UNIT_SCRIPT("passed"));
    writeFileSync(join(cwd, "bdd.cjs"), "");
    expect(() => runSuite(cwd, { unit: "node unit.cjs", bdd: "node bdd.cjs" })).toThrow("bdd: the runner wrote no report (exit 0)");
  });

  it("refuses a unit runner that wrote no report, with its exit code", () => {
    writeFileSync(join(cwd, "unit.cjs"), "process.exit(4);");
    writeFileSync(join(cwd, "bdd.cjs"), BDD_SCRIPT("PASSED"));
    expect(() => runSuite(cwd, { unit: "node unit.cjs", bdd: "node bdd.cjs" })).toThrow("unit: the runner wrote no report (exit 4)");
  });

  it("counts a unit runner that exits 1 with a green report as a red suite", () => {
    expect(suite("passed", "PASSED", { unit: "process.exitCode = 1;" }).unit).toEqual(["unit: the runner exited 1 but its report names no failing test"]);
  });

  it("counts a BDD runner that exits 1 with a green report as a red suite", () => {
    expect(suite("passed", "PASSED", { bdd: "process.exitCode = 1;" }).bdd).toEqual(["bdd: the runner exited 1 but its report names no failing scenario"]);
  });

  it("counts a runner killed by a signal after a green report as a red suite", () => {
    expect(suite("passed", "PASSED", { unit: 'process.kill(process.pid, "SIGKILL");' }, { unit: "exec node unit.cjs", bdd: "node bdd.cjs" }).unit).toEqual(["unit: the runner exited null but its report names no failing test"]);
  });

  it("returns the reports it read, as the runners wrote them", () => {
    expect(suite("passed", "PASSED").reports).toEqual({ unit: expect.stringContaining('"fullName":"totals > adds"'), bdd: expect.stringContaining('"uri":"features/pay.feature"') });
  });
});
