import { describe, expect, it } from "vitest";
import { detectCommentedOutCode, detectDuplication } from "../../src/artifacts/code-health.js";
import { dir, useTempDir, write } from "./temp-project.js";

const PATHS = { spec: "SPEC.md", progress: "progress.json", features: [], source: ["src/**"], steps: [], tests: ["tests/unit/**"], docs: [] };
const LIMITS = { min_lines: 6, min_tokens: 50 };
const SRC_ONLY_TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, module: "NodeNext", target: "ES2022" }, include: ["src/**/*.ts"] });
const CLONE = [
  "export function NAME(items: number[]): number {",
  "  let sum = 0;",
  "  for (const item of items) {",
  "    sum += item * 1;",
  "    sum -= 1;",
  "  }",
  "  const average = sum / items.length;",
  "  return Math.round(average);",
  "}",
  "",
].join("\n");

useTempDir();

describe("detectDuplication outside the files tsconfig.json compiles", () => {
  it("scans the test files that match the test globs even when tsconfig.json does not include them", () => {
    write("tsconfig.json", SRC_ONLY_TSCONFIG);
    write("tests/unit/orders.test.ts", CLONE.replace("NAME", "orderTotal"));
    write("tests/unit/invoices.test.ts", CLONE.replace("NAME", "invoiceTotal"));
    const found = detectDuplication(dir, PATHS, LIMITS);
    expect(found.map(({ file, related }) => [file, related?.[0]?.file])).toEqual([["tests/unit/invoices.test.ts", "tests/unit/orders.test.ts"]]);
  });
});

describe("detectCommentedOutCode outside the files tsconfig.json compiles", () => {
  it("scans the source and test files that match the globs even when tsconfig.json does not include them", () => {
    write("tsconfig.json", SRC_ONLY_TSCONFIG);
    write("tests/unit/orders.test.ts", "// const legacy = compute();\n// legacy.run();\n");
    write("src/orders.mts", "// const legacy = compute();\n// legacy.run();\n");
    expect(detectCommentedOutCode(dir, PATHS).map(({ file }) => file)).toEqual(["src/orders.mts", "tests/unit/orders.test.ts"]);
  });
});

describe("detectCommentedOutCode on files that are not code", () => {
  it("leaves out the files that match the test globs but are not TypeScript or JavaScript", () => {
    write("tsconfig.json", SRC_ONLY_TSCONFIG);
    write("features/orders.feature", "Feature: Orders\n// const legacy = compute();\n// legacy.run();\n");
    write("tests/unit/orders.test.ts", "// const legacy = compute();\n// legacy.run();\n");
    const paths = { ...PATHS, tests: ["tests/unit/**", "features/**/*.feature"] };
    expect(detectCommentedOutCode(dir, paths).map(({ file }) => file)).toEqual(["tests/unit/orders.test.ts"]);
  });
});
