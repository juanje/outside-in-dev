import { describe, expect, it } from "vitest";
import { knipConfig, knipFindings } from "../../src/artifacts/dead-code.js";

/** One entry of `issues` in the JSON reporter of knip 6.39.0, recorded from a real run: every list is present and empty unless it has findings. */
function recordedIssue(file: string, found: Record<string, unknown[]>) {
  return {
    file,
    binaries: [],
    catalog: [],
    catalogReferences: [],
    dependencies: [],
    devDependencies: [],
    duplicates: [],
    enumMembers: [],
    exports: [],
    files: [],
    namespaceMembers: [],
    optionalPeerDependencies: [],
    types: [],
    unlisted: [],
    unresolved: [],
    ...found,
  };
}

describe("knipFindings", () => {
  it("turns an unused export of the knip report into a finding at its line", () => {
    const report = { issues: [recordedIssue("src/lib.ts", { exports: [{ name: "unusedFn", line: 2, col: 17, pos: 61 }] })] };
    expect(knipFindings(report)).toEqual([
      { category: "dead_code", file: "src/lib.ts", range: { start: 2, end: 2 }, symbol: "unusedFn", detail: "unused export" },
    ]);
  });

  it("reports an exported type that nothing imports as an unused export", () => {
    const report = { issues: [recordedIssue("src/lib.ts", { types: [{ name: "Unused", line: 3, col: 13, pos: 106 }] })] };
    expect(knipFindings(report)).toEqual([
      { category: "dead_code", file: "src/lib.ts", range: { start: 3, end: 3 }, symbol: "Unused", detail: "unused export" },
    ]);
  });

  it("reports a file that nothing imports at its first line", () => {
    const report = { issues: [recordedIssue("src/orphan.ts", { files: [{ name: "src/orphan.ts" }] })] };
    expect(knipFindings(report)).toEqual([
      { category: "dead_code", file: "src/orphan.ts", range: { start: 1, end: 1 }, detail: "unused file" },
    ]);
  });

  it("reports an unused dependency against the line of package.json that declares it", () => {
    const packageJson = ["{", '  "name": "fixture",', '  "dependencies": {', '    "bun": "1.0.0",', '    "left-pad": "1.3.0"', "  }", "}"].join("\n");
    const report = { issues: [recordedIssue("package.json", { dependencies: [{ name: "left-pad" }] })] };
    expect(knipFindings(report, packageJson)).toEqual([
      { category: "dead_code", file: "package.json", range: { start: 5, end: 5 }, detail: "unused dependency left-pad" },
    ]);
  });

  it("names an unused development dependency as such", () => {
    const packageJson = ["{", '  "devDependencies": {', '    "dev-tool": "1.0.0"', "  }", "}"].join("\n");
    const report = { issues: [recordedIssue("package.json", { devDependencies: [{ name: "dev-tool" }] })] };
    expect(knipFindings(report, packageJson)).toEqual([
      { category: "dead_code", file: "package.json", range: { start: 3, end: 3 }, detail: "unused devDependency dev-tool" },
    ]);
  });
});

describe("knipConfig", () => {
  it("makes the test files and the configured entries the entry points, the source and test files the project, and ignores generated files", () => {
    const paths = { source: ["src/**"], tests: ["tests/unit/**", "features/steps/**"] };
    expect(knipConfig(paths, ["src/worker.ts"])).toEqual({
      entry: ["tests/unit/**", "features/steps/**", "src/worker.ts"],
      project: ["src/**", "tests/unit/**", "features/steps/**"],
      ignore: ["**/*.generated.*"],
    });
  });
});
