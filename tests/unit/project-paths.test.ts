import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { loadProjectPaths } from "../../src/artifacts/project-paths.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(paths: { spec: string; progress: string; bdd_features: string[]; source?: string[]; unit_tests?: string[]; bdd_steps?: string[]; docs?: string[] }): void {
  const config = {
    version: 1,
    stack: "typescript",
    paths: { source: ["src/**"], shared: [], unit_tests: ["tests/**"], bdd_steps: [], docs: [], design: [], ...paths },
    commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
  };
  writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
}

describe("loadProjectPaths", () => {
  it("takes the spec, progress file and feature globs from .outside-in.json", () => {
    writeConfig({
      spec: "specs/SPEC.md",
      progress: "specs/progress.json",
      bdd_features: ["specs/features/**/*.feature", "extra/*.feature"],
      source: ["lib/**"],
      unit_tests: ["spec/**"],
      bdd_steps: ["specs/steps/**"],
      docs: ["guide/**"],
    });
    expect(loadProjectPaths(dir)).toEqual({
      spec: "specs/SPEC.md",
      progress: "specs/progress.json",
      features: ["specs/features/**/*.feature", "extra/*.feature"],
      source: ["lib/**"],
      tests: ["spec/**", "specs/steps/**", "specs/features/**/*.feature", "extra/*.feature"],
      docs: ["guide/**"],
    });
  });

  it("falls back to SPEC.md, progress.json and features/**/*.feature without a configuration file", () => {
    expect(loadProjectPaths(dir)).toEqual({
      spec: "SPEC.md",
      progress: "progress.json",
      features: ["features/**/*.feature"],
      source: ["src/**"],
      tests: ["tests/unit/**", "features/steps/**", "features/support/**", "features/**/*.feature"],
      docs: ["README.md", "docs/**"],
    });
  });

  it("rejects a configuration that is not valid JSON", () => {
    writeFileSync(join(dir, ".outside-in.json"), "{ nope");
    expect(() => loadProjectPaths(dir)).toThrow(ProgressError);
    expect(() => loadProjectPaths(dir)).toThrow(/^\.outside-in\.json is not valid JSON: /);
  });
});
