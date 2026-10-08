import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findingLines, summaryCount } from "./metrics-output.js";
import { dir, useTempDir, writeMinimalConfig, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";
import { runOid } from "./run-capture.js";

useTempDir();

describe("oid metrics", () => {
  it("prints the findings of the project with the configured limits and exits 0", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/busy.ts"), "export function busy(a: boolean): number {\n  return a ? 1 : 0;\n}\n");
    writeMinimalConfig({ refactor: { detectors: { complexity: { max_cyclomatic: 1 } } } });
    const { exitCode, stdout } = await runOid(["metrics"], dir);
    expect(exitCode).toBe(0);
    expect(findingLines(stdout, "complexity")).toEqual(["complexity src/busy.ts:1-3 [busy] cyclomatic complexity 2 > 1"]);
    expect(summaryCount(stdout, "complexity")).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("prints the blocks duplicated between files, with both locations, and counts them", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    const block = "export function NAME(items: number[]): number {\n  let sum = 0;\n  for (const item of items) {\n    sum += item * 1;\n    sum -= 1;\n  }\n  const average = sum / items.length;\n  return Math.round(average);\n}\n";
    writeFileSync(join(dir, "src/orders.ts"), block.replace("NAME", "orderTotal"));
    writeFileSync(join(dir, "src/invoices.ts"), block.replace("NAME", "invoiceTotal"));
    const { exitCode, stdout } = await runOid(["metrics"], dir);
    expect(exitCode).toBe(0);
    expect(findingLines(stdout, "duplication")).toEqual(["duplication src/invoices.ts:1-9 9 duplicated lines, also src/orders.ts:1-9"]);
    expect(summaryCount(stdout, "duplication")).toBe(1);
  });

  it("prints the unused files of the project, with the entry points of refactor.entry left out, and counts them", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", main: "src/main.ts" }));
    writeFileSync(join(dir, "src/main.ts"), "console.log(1);\n");
    writeFileSync(join(dir, "src/orphan.ts"), "export const lonely = 1;\n");
    writeFileSync(join(dir, "src/worker.ts"), "console.log(1);\n");
    writeMinimalConfig({ refactor: { entry: ["src/worker.ts"] } });
    const { exitCode, stdout } = await runOid(["metrics"], dir);
    expect(exitCode).toBe(0);
    expect(findingLines(stdout, "dead_code")).toEqual(["dead_code src/orphan.ts:1-1 unused file"]);
    expect(summaryCount(stdout, "dead_code")).toBe(1);
  });

  it("prints the unused locals of the project, also without a package.json", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/total.ts"), "export function total(items: number[]): number {\n  const unusedCount = items.length;\n  return 0;\n}\n");
    const { exitCode, stdout } = await runOid(["metrics"], dir);
    expect(exitCode).toBe(0);
    expect(findingLines(stdout, "dead_code")).toEqual(["dead_code src/total.ts:2-2 [unusedCount] unused declaration"]);
    expect(summaryCount(stdout, "dead_code")).toBe(1);
  });

  it("prints the numeric literals and repeated strings of the source files, not those of the test files", async () => {
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "tests/unit"), { recursive: true });
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts", "tests/**/*.ts"] }));
    writeFileSync(join(dir, "src/limits.ts"), 'export const isLong = (n: number) => n > 42 || n === 7;\nexport const label = (s: string) => s + "tag" + "tag";\n');
    writeFileSync(join(dir, "src/more.ts"), 'export const other = ["tag"];\n');
    writeFileSync(join(dir, "tests/unit/limits.test.ts"), "export const big = 4242;\n");
    const { exitCode, stdout } = await runOid(["metrics"], dir);
    expect(exitCode).toBe(0);
    expect(findingLines(stdout, "magic_value")).toEqual([
      "magic_value src/limits.ts:1-1 magic number 42",
      "magic_value src/limits.ts:1-1 magic number 7",
      'magic_value src/limits.ts:2-2 string "tag" repeated 3 times, also src/limits.ts:2-2, also src/more.ts:1-1',
    ]);
    expect(summaryCount(stdout, "magic_value")).toBe(3);
  });

  it("prints the JSDoc of the source files that does not match the signature, and counts it", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/greet.ts"), "/**\n * Greets.\n * @param nmae who\n */\nexport function greet(name: string): string {\n  return name;\n}\n");
    const { exitCode, stdout } = await runOid(["metrics"], dir);
    expect(exitCode).toBe(0);
    expect(findingLines(stdout, "doc_drift")).toEqual([
      "doc_drift src/greet.ts:1-4 [greet] @param nmae matches no parameter",
      "doc_drift src/greet.ts:1-4 [greet] parameter name is not documented",
    ]);
    expect(summaryCount(stdout, "doc_drift")).toBe(2);
  });

  it("prints the code the Markdown files of the documentation paths name and the source does not declare", async () => {
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "docs/guide"), { recursive: true });
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/table.ts"), "export function renderTable(): string {\n  return '';\n}\n");
    writeFileSync(join(dir, "README.md"), "# Demo\n\nCall `renderTable()`, not `drawChart()`.\n");
    writeFileSync(join(dir, "docs/guide/api.md"), "See `OrderBook` and `src/old.ts`.\n");
    writeFileSync(join(dir, "docs/guide/notes.txt"), "See `lostFromText()`.\n");
    const { exitCode, stdout } = await runOid(["metrics"], dir);
    expect(exitCode).toBe(0);
    expect(findingLines(stdout, "doc_drift")).toEqual([
      "doc_drift README.md:3-3 `drawChart()` is not declared in source",
      "doc_drift docs/guide/api.md:1-1 `OrderBook` is not declared in source",
      "doc_drift docs/guide/api.md:1-1 `src/old.ts` does not exist",
    ]);
    expect(summaryCount(stdout, "doc_drift")).toBe(3);
  });

  it("finds a documented path from the base directory of a source root too", async () => {
    mkdirSync(join(dir, "lib/util"), { recursive: true });
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["lib/**/*.ts"] }));
    writeFileSync(join(dir, "lib/util/text.ts"), "export const SEPARATOR = '-';\n");
    writeFileSync(join(dir, "README.md"), "See `util/text.ts` and `util/gone.ts`.\n");
    const config = {
      version: 1,
      stack: "typescript",
      paths: { source: ["lib/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: ["README.md"], spec: "SPEC.md", design: [], progress: "progress.json" },
      commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
    };
    writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
    const { stdout } = await runOid(["metrics"], dir);
    expect(findingLines(stdout, "doc_drift")).toEqual(["doc_drift README.md:1-1 `util/gone.ts` does not exist"]);
  });
});
