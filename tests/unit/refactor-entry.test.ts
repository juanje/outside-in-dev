import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRefactorEntry } from "../../src/artifacts/project-config.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("loadRefactorEntry", () => {
  it("is empty without a configuration file", () => {
    expect(loadRefactorEntry(dir)).toEqual([]);
  });

  it("lists the entry points of refactor.entry in .outside-in.json", () => {
    const config = {
      version: 1,
      stack: "typescript",
      paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
      commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
      refactor: { entry: ["src/worker.ts"] },
    };
    writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
    expect(loadRefactorEntry(dir)).toEqual(["src/worker.ts"]);
  });
});
