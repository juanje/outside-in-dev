import { describe, expect, it } from "vitest";
import { type ChangedFile, integrityViolations } from "../../src/artifacts/integrity.js";

const PATTERNS = { source: ["BAD_SRC"], tests: ["BAD_TEST"] };

function changed(file: string, kind: ChangedFile["kind"], added: string[] = []): ChangedFile {
  return { file, kind, added: added.map((text, at) => ({ line: at + 1, text })), frozen: [], sourceReads: [] };
}

describe("integrityViolations", () => {
  it("rejects a change to source code in the steps that write tests", () => {
    const files = [changed("src/a.ts", "source"), changed("tests/unit/a.test.ts", "unit test")];
    for (const step of ["bdd_red", "tdd_red"]) {
      expect(integrityViolations(step, files, PATTERNS)).toEqual(["src/a.ts changed source code while writing tests"]);
    }
  });

  it("rejects a change to a unit test, a step file or a feature file in the steps that write code", () => {
    const files = [
      changed("src/a.ts", "source"),
      changed("tests/unit/a.test.ts", "unit test"),
      changed("features/steps/a.steps.ts", "step"),
      changed("features/a.feature", "feature"),
    ];
    for (const step of ["tdd_green", "refactor"]) {
      expect(integrityViolations(step, files, PATTERNS)).toEqual([
        "tests/unit/a.test.ts changed a test while writing code",
        "features/steps/a.steps.ts changed a test while writing code",
        "features/a.feature changed a test while writing code",
      ]);
    }
  });

  it("names each forbidden pattern in the added lines of the files the step is about, with its line", () => {
    const files = [
      changed("src/a.ts", "source", ["ok", "x BAD_SRC x", "BAD_TEST"]),
      changed("tests/unit/a.test.ts", "unit test", ["BAD_SRC", "ok", "BAD_TEST"]),
      changed("features/steps/a.steps.ts", "step", ["BAD_TEST"]),
      changed("features/a.feature", "feature", ["BAD_TEST", "BAD_SRC"]),
    ];
    const patternLines = (step: string) => integrityViolations(step, files, PATTERNS).filter((line) => line.includes("forbidden pattern"));
    expect(patternLines("tdd_red")).toEqual([
      'tests/unit/a.test.ts:3 forbidden pattern "BAD_TEST" in a test',
      'features/steps/a.steps.ts:1 forbidden pattern "BAD_TEST" in a test',
    ]);
    expect(patternLines("tdd_green")).toEqual(['src/a.ts:2 forbidden pattern "BAD_SRC" in source']);
    expect(patternLines("quality_gate")).toEqual([
      'src/a.ts:2 forbidden pattern "BAD_SRC" in source',
      'tests/unit/a.test.ts:3 forbidden pattern "BAD_TEST" in a test',
      'features/steps/a.steps.ts:1 forbidden pattern "BAD_TEST" in a test',
    ]);
  });

  it("rejects a change to an approved feature file in every step, once", () => {
    const approved = { ...changed("features/a.feature", "feature"), frozen: ["Greet Ann", "the parts outside scenarios"] };
    const files = [approved, changed("features/b.feature", "feature")];
    for (const step of ["select", "bdd_red", "tdd_red", "refactor", "quality_gate"]) {
      expect(integrityViolations(step, files, PATTERNS).filter((line) => line.startsWith("features/a.feature"))).toHaveLength(1);
    }
    expect(integrityViolations("select", files, PATTERNS)).toEqual(["features/a.feature changed an approved feature file: Greet Ann, the parts outside scenarios"]);
    expect(integrityViolations("tdd_green", files, PATTERNS)).toEqual([
      "features/a.feature changed a test while writing code",
      "features/b.feature changed a test while writing code",
    ]);
  });

  it("reads readFileSync as the call that reads source code, not as the text", () => {
    const patterns = { source: [], tests: ["readFileSync"] };
    const test = { ...changed("tests/unit/a.test.ts", "unit test", ["readFileSync(a)", "readFileSync(b)", "x"]), sourceReads: [2, 3] };
    expect(integrityViolations("tdd_red", [test], patterns)).toEqual(["tests/unit/a.test.ts:2 reads source code as text"]);
    expect(integrityViolations("tdd_red", [test], { source: [], tests: [] })).toEqual([]);
  });
});
