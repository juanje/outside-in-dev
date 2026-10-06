import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { detectComplexity, detectDuplication } from "../../src/artifacts/code-health.js";

const PATHS = { spec: "SPEC.md", progress: "progress.json", features: [], source: ["src/**"], tests: ["tests/unit/**"] };
const LIMITS = { max_cyclomatic: 1, max_depth: 4 };
const BUSY = "export function busy(a: boolean): number {\n  return a ? 1 : 2;\n}\n";
const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, module: "NodeNext", target: "ES2022" }, include: ["src/**/*.ts"] });

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

describe("detectComplexity", () => {
  it("reports the complex functions of the source files with their path relative to the project", () => {
    write("tsconfig.json", TSCONFIG);
    write("src/busy.ts", BUSY);
    expect(detectComplexity(dir, PATHS, LIMITS)).toEqual([
      {
        category: "complexity",
        file: "src/busy.ts",
        range: { start: 1, end: 3 },
        symbol: "busy",
        detail: "cyclomatic complexity 2 > 1",
      },
    ]);
  });

  it("leaves out the files that match the test globs, even under the source path", () => {
    write("tsconfig.json", TSCONFIG);
    write("src/busy.ts", BUSY);
    write("src/busy.test.ts", BUSY.replace("busy", "busyTest"));
    const found = detectComplexity(dir, { ...PATHS, tests: ["src/**/*.test.ts"] }, LIMITS);
    expect(found.map(({ file }) => file)).toEqual(["src/busy.ts"]);
  });

  it("analyses only the files tsconfig.json compiles", () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"], exclude: ["src/skipped.ts"] }));
    write("src/busy.ts", BUSY);
    write("src/skipped.ts", BUSY.replace("busy", "skipped"));
    write("src/notes.md", "# not TypeScript\n");
    expect(detectComplexity(dir, PATHS, LIMITS).map(({ file }) => file)).toEqual(["src/busy.ts"]);
  });

  it("fails naming tsconfig.json when the project has none", () => {
    write("src/busy.ts", BUSY);
    expect(() => detectComplexity(dir, PATHS, LIMITS)).toThrow(ProgressError);
    expect(() => detectComplexity(dir, PATHS, LIMITS)).toThrow("tsconfig.json not found");
  });
});

const CLONE = "export function NAME(items: number[]): number {\n  let sum = 0;\n  for (const item of items) {\n    sum += item * 2;\n    sum -= 1;\n  }\n  const average = sum / items.length;\n  return Math.round(average);\n}\n";
const DUPLICATION_LIMITS = { min_lines: 6, min_tokens: 50 };

describe("detectDuplication", () => {
  it("reports a block repeated in two source files with both locations, relative to the project", () => {
    write("tsconfig.json", TSCONFIG);
    write("src/orders.ts", CLONE.replace("NAME", "orderTotal"));
    write("src/invoices.ts", CLONE.replace("NAME", "invoiceTotal"));
    expect(detectDuplication(dir, PATHS, DUPLICATION_LIMITS)).toEqual([
      {
        category: "duplication",
        file: "src/invoices.ts",
        range: { start: 1, end: 9 },
        detail: "9 duplicated lines",
        related: [{ file: "src/orders.ts", range: { start: 1, end: 9 } }],
      },
    ]);
  });

  it("also scans the test files, so a block copied from the source into a test is reported", () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts", "tests/**/*.ts"] }));
    write("src/orders.ts", CLONE.replace("NAME", "orderTotal"));
    write("tests/unit/orders.test.ts", CLONE.replace("NAME", "expectedTotal"));
    const found = detectDuplication(dir, PATHS, DUPLICATION_LIMITS);
    expect(found.map(({ file, related }) => [file, related?.[0]?.file])).toEqual([["src/orders.ts", "tests/unit/orders.test.ts"]]);
  });

  it("scans nothing, rather than the whole project, when no file is compiled", () => {
    write("tsconfig.json", TSCONFIG);
    write("other/orders.ts", CLONE.replace("NAME", "orderTotal"));
    write("other/invoices.ts", CLONE.replace("NAME", "invoiceTotal"));
    expect(detectDuplication(dir, PATHS, DUPLICATION_LIMITS)).toEqual([]);
  });
});
