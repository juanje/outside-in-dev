import { describe, expect, it } from "vitest";
import { parseProjectConfig } from "../../src/artifacts/project-config.js";

const VALID = {
  version: 1,
  stack: "typescript",
  paths: {
    source: ["src/**"],
    shared: [],
    unit_tests: ["tests/unit/**"],
    bdd_features: ["features/**/*.feature"],
    bdd_steps: ["features/steps/**"],
    docs: ["README.md"],
    spec: "SPEC.md",
    design: ["SPEC.md"],
    progress: "progress.json",
  },
  commands: {
    bdd: "npx cucumber-js",
    unit: "npx vitest run",
    typecheck: "npx tsc --noEmit",
    format: null,
    lint: null,
    coverage: null,
    extra_checks: [],
  },
};

describe("parseProjectConfig", () => {
  it("rejects an unsupported stack, naming the field", () => {
    expect(() => parseProjectConfig({ ...VALID, stack: "python" })).toThrow(/stack/);
  });
});
