import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDuplicationLimits } from "../../src/artifacts/project-config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadDuplicationLimits", () => {
  it("defaults to 6 lines and 50 tokens without a configuration file", () => {
    expect(loadDuplicationLimits(dir)).toEqual({ min_lines: 6, min_tokens: 50 });
  });

  it("takes a limit from .outside-in.json and keeps the default of the one left out", () => {
    const config = {
      version: 1,
      stack: "typescript",
      paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
      commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
      refactor: { detectors: { duplication: { min_lines: 3 } } },
    };
    writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
    expect(loadDuplicationLimits(dir)).toEqual({ min_lines: 3, min_tokens: 50 });
  });
});
