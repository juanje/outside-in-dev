import { describe, expect, it } from "vitest";
import { forbiddenPatterns } from "../../src/artifacts/integrity.js";
import { parseProjectConfig } from "../../src/artifacts/project-config.js";

/** A valid configuration with `integrity` as given. */
function configWith(integrity?: unknown) {
  const base = {
    version: 1,
    stack: "typescript",
    paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
    commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
  };
  return parseProjectConfig(integrity === undefined ? base : { ...base, integrity });
}

describe("forbiddenPatterns", () => {
  it("is the default lists without an integrity block, and the configured list for each list given", () => {
    const defaults = forbiddenPatterns(configWith());
    expect(defaults.source).toHaveLength(5);
    expect(defaults.tests).toHaveLength(4);
    expect(defaults.tests).toContain("readFileSync");
    expect(forbiddenPatterns(configWith({ forbidden_in_src: ["XYZ"] }))).toEqual({ source: ["XYZ"], tests: defaults.tests });
    expect(forbiddenPatterns(configWith({ forbidden_in_tests: [] }))).toEqual({ source: defaults.source, tests: [] });
  });

  it("refuses a field of the integrity block that does not exist", () => {
    expect(() => configWith({ forbidden_in_docs: [] })).toThrow(`integrity: Unrecognized key: "forbidden_in_docs"`);
  });
});
