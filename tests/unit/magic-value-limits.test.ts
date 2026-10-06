import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMagicValueLimits } from "../../src/artifacts/project-config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadMagicValueLimits", () => {
  it("defaults to ignoring 0, 1 and -1 and to 3 string repeats without a configuration file", () => {
    expect(loadMagicValueLimits(dir)).toEqual({ ignore: [0, 1, -1], min_string_repeats: 3 });
  });

  it("takes a limit from .outside-in.json and keeps the default of the one left out", () => {
    const config = {
      version: 1,
      stack: "typescript",
      paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
      commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
      refactor: { detectors: { magic_value: { ignore: [0, 1, -1, 100] } } },
    };
    writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
    expect(loadMagicValueLimits(dir)).toEqual({ ignore: [0, 1, -1, 100], min_string_repeats: 3 });
  });
});
