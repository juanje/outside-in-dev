import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadComplexityLimits } from "../../src/artifacts/project-config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadComplexityLimits", () => {
  it("defaults to a cyclomatic complexity of 10 and a nesting depth of 4 without a configuration file", () => {
    expect(loadComplexityLimits(dir)).toEqual({ max_cyclomatic: 10, max_depth: 4 });
  });

  it("takes a limit from .outside-in.json and keeps the default of the one left out", () => {
    const config = {
      version: 1,
      stack: "typescript",
      paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
      commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
      refactor: { detectors: { complexity: { max_cyclomatic: 3 } } },
    };
    writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
    expect(loadComplexityLimits(dir)).toEqual({ max_cyclomatic: 3, max_depth: 4 });
  });
});
