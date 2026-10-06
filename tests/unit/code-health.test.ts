import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { detectComplexity, detectDuplication, detectCommentedOutCode, detectUnusedCode, detectUnusedDeclarations } from "../../src/artifacts/code-health.js";
import { dir, useTempDir, write } from "./temp-project.js";

const PATHS = { spec: "SPEC.md", progress: "progress.json", features: [], source: ["src/**"], tests: ["tests/unit/**"], docs: [] };
const LIMITS = { max_cyclomatic: 1, max_depth: 4 };
const BUSY = "export function busy(a: boolean): number {\n  return a ? 1 : 2;\n}\n";
const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, module: "NodeNext", target: "ES2022" }, include: ["src/**/*.ts"] });

useTempDir();

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

const PACKAGE_JSON = ["{", '  "name": "fixture",', '  "main": "src/main.ts",', '  "dependencies": {', '    "bun": "1.0.0"', "  }", "}"].join("\n");

describe("detectUnusedCode", () => {
  it("reports the files and dependencies that nothing uses, run through knip with paths relative to the project", () => {
    write("tsconfig.json", TSCONFIG);
    write("package.json", PACKAGE_JSON);
    write("src/main.ts", "console.log(1);\n");
    write("src/orphan.ts", "export const lonely = 1;\n");
    expect(detectUnusedCode(dir, PATHS, [])).toEqual([
      { category: "dead_code", file: "src/orphan.ts", range: { start: 1, end: 1 }, detail: "unused file" },
      { category: "dead_code", file: "package.json", range: { start: 5, end: 5 }, detail: "unused dependency bun" },
    ]);
  });

  it("reports nothing, rather than failing, when the project has no package.json", () => {
    write("tsconfig.json", TSCONFIG);
    write("src/orphan.ts", "export const lonely = 1;\n");
    expect(detectUnusedCode(dir, PATHS, [])).toEqual([]);
  });
});

describe("detectUnusedDeclarations", () => {
  it("reports the unused locals and parameters of source and test files even when tsconfig.json does not ask for them, and skips parameters that start with an underscore", () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true, module: "NodeNext", target: "ES2022" }, include: ["src/**/*.ts", "tests/**/*.ts"] }));
    write("src/pick.ts", "export function pick(first: number, second: number, _third: number): number {\n  return first;\n}\n");
    write("tests/unit/pick.test.ts", "const leftover = 3;\nconsole.log(1);\n");
    expect(detectUnusedDeclarations(dir, PATHS)).toEqual([
      { category: "dead_code", file: "src/pick.ts", range: { start: 1, end: 1 }, symbol: "second", detail: "unused declaration" },
      { category: "dead_code", file: "tests/unit/pick.test.ts", range: { start: 1, end: 1 }, symbol: "leftover", detail: "unused declaration" },
    ]);
  });
});

describe("detectCommentedOutCode", () => {
  it("reports the commented-out code of the source and test files with their path relative to the project", () => {
    write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts", "tests/**/*.ts"] }));
    write("src/total.ts", "export function total(): number {\n  // const old = 1;\n  // return old + 1;\n  return 2;\n}\n");
    write("tests/unit/total.test.ts", "/*\nconst legacy = compute();\nlegacy.run();\n*/\n");
    expect(detectCommentedOutCode(dir, PATHS)).toEqual([
      { category: "dead_code", file: "src/total.ts", range: { start: 2, end: 3 }, detail: "commented-out code" },
      { category: "dead_code", file: "tests/unit/total.test.ts", range: { start: 1, end: 4 }, detail: "commented-out code" },
    ]);
  });
});
