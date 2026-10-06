import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("oid metrics", () => {
  it("prints the findings of the project with the configured limits and exits 0", () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/busy.ts"), "export function busy(a: boolean): number {\n  return a ? 1 : 2;\n}\n");
    const config = {
      version: 1,
      stack: "typescript",
      paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
      commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
      refactor: { detectors: { complexity: { max_cyclomatic: 1 } } },
    };
    writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
    let stdout = "";
    const exitCode = runCli(["metrics"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(exitCode).toBe(0);
    expect(stdout).toBe("complexity src/busy.ts:1-3 [busy] cyclomatic complexity 2 > 1\ncomplexity 1\n");
  });

  it("prints the blocks duplicated between files, with both locations, and counts them", () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    const block = "export function NAME(items: number[]): number {\n  let sum = 0;\n  for (const item of items) {\n    sum += item * 2;\n    sum -= 1;\n  }\n  const average = sum / items.length;\n  return Math.round(average);\n}\n";
    writeFileSync(join(dir, "src/orders.ts"), block.replace("NAME", "orderTotal"));
    writeFileSync(join(dir, "src/invoices.ts"), block.replace("NAME", "invoiceTotal"));
    let stdout = "";
    const exitCode = runCli(["metrics"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(exitCode).toBe(0);
    expect(stdout).toBe("duplication src/invoices.ts:1-9 9 duplicated lines, also src/orders.ts:1-9\nduplication 1\n");
  });

  it("prints the unused files of the project, with the entry points of refactor.entry left out, and counts them", () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", main: "src/main.ts" }));
    writeFileSync(join(dir, "src/main.ts"), "console.log(1);\n");
    writeFileSync(join(dir, "src/orphan.ts"), "export const lonely = 1;\n");
    writeFileSync(join(dir, "src/worker.ts"), "console.log(2);\n");
    const config = {
      version: 1,
      stack: "typescript",
      paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
      commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
      refactor: { entry: ["src/worker.ts"] },
    };
    writeFileSync(join(dir, ".outside-in.json"), JSON.stringify(config));
    let stdout = "";
    const exitCode = runCli(["metrics"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(exitCode).toBe(0);
    expect(stdout).toBe("dead_code src/orphan.ts:1-1 unused file\ndead_code 1\n");
  });

  it("prints the unused locals of the project, also without a package.json", () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts"] }));
    writeFileSync(join(dir, "src/total.ts"), "export function total(items: number[]): number {\n  const unusedCount = items.length;\n  return 0;\n}\n");
    let stdout = "";
    const exitCode = runCli(["metrics"], { cwd: dir, stdout: (text) => (stdout += text), stderr: () => undefined });
    expect(exitCode).toBe(0);
    expect(stdout).toBe("dead_code src/total.ts:2-2 [unusedCount] unused declaration\ndead_code 1\n");
  });
});
