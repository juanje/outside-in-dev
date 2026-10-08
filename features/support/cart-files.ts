// The files the scripted agents of features/run-04.feature write into the cart project, and the project around them.
// The recordings in features/support/recorded/ were made from exactly these contents (see replay-unit.mjs).

export const TEST_FILE = "tests/unit/cart-lines.test.ts";
export const STEP_FILE = "features/steps/cart-lines.steps.ts";
export const CART_FILE = "src/cart.ts";

const VITEST_IMPORT = `import { describe, expect, it } from "vitest";\nimport { countLines } from "../../src/lines.js";\n`;

const ADDS_A_LINE = `  it("adds a line", () => {\n    expect(countLines(addLine([], "tea"))).toBe(1);\n  });\n`;
const REMOVES_A_LINE = `  it("removes a line", () => {\n    expect(countLines(removeLine(["tea"], "tea"))).toBe(0);\n  });\n`;
const ADDS_A_SECOND_LINE = `  it("adds a second line", () => {\n    expect(addLine(["tea"], "tea")).toEqual(["tea"]);\n  });\n`;

/** A unit test file: the imports of the cart code it uses, and the tests of its `describe`. */
function testFile(imports: string[], tests: string[]): string {
  return `${VITEST_IMPORT}import { ${imports.join(", ")} } from "../../src/cart.js";\n\ndescribe("cart lines", () => {\n${tests.join("\n")}});\n`;
}

/** The unit tests the test-writing agent writes, by the name they are reported under. */
export const UNIT_TESTS = {
  "adds a line": testFile(["addLine"], [ADDS_A_LINE]),
  "removes a line": testFile(["addLine", "removeLine"], [ADDS_A_LINE, REMOVES_A_LINE]),
  "adds a second line": testFile(["addLine"], [ADDS_A_LINE, ADDS_A_SECOND_LINE]),
  "fails with an error": `${VITEST_IMPORT}\ndescribe("cart lines", () => {\n  it("adds a line", () => {\n    throw new Error("the cart could not be built");\n  });\n});\n`,
  "passes at once": `${VITEST_IMPORT}\ndescribe("cart lines", () => {\n  it("adds a line", () => {\n    expect(countLines(["tea"])).toBe(1);\n  });\n});\n`,
} as const;

const IMPORT_CART = `const { addLine } = await import("../../src/cart.js");`;

/** The step definitions of the first scenario. The scenario needs `addLine` and `countCartLines` of the cart code. */
const ADD_STEPS = `When("a line is added", async function () {\n  ${IMPORT_CART}\n  this.lines = addLine([], "tea");\n});\n`;
const COUNT_STEP = `Then("the cart has {int} line(s)", async function (count: number) {\n  const { countCartLines } = await import("../../src/cart.js");\n  assert.equal(countCartLines(this.lines), count);\n});\n`;
const REMOVE_STEPS = `Given("a cart with {int} line(s)", function (count: number) {\n  this.lines = Array.from({ length: count }, () => "tea");\n});\n\nWhen("the line is removed", async function () {\n  const { removeLine } = await import("../../src/cart.js");\n  this.lines = removeLine(this.lines, "tea");\n});\n`;
const STEP_IMPORTS = (names: string[]): string => `import assert from "node:assert/strict";\nimport { ${names.join(", ")} } from "@cucumber/cucumber";\n`;

/** The step files the step-writing agent writes: round 0 for "Add a line", round 1 for "Remove a line" (the whole file again). */
export const STEP_ROUNDS = [`${STEP_IMPORTS(["Then", "When"])}\n${ADD_STEPS}\n${COUNT_STEP}`, `${STEP_IMPORTS(["Given", "Then", "When"])}\n${ADD_STEPS}\n${REMOVE_STEPS}\n${COUNT_STEP}`];

/** The cart code the coding agent writes, by what it implements. */
const ADD_CODE = `/** Adds a line to a cart. */\nexport function addLine(lines: string[], line: string): string[] {\n  return [...lines, line];\n}\n`;
const ADD_ONCE_CODE = `/** Adds a line to a cart unless the cart has it. */\nexport function addLine(lines: string[], line: string): string[] {\n  return lines.includes(line) ? lines : [...lines, line];\n}\n`;
const COUNT_CODE = `\n/** Counts the lines of a cart. */\nexport function countCartLines(lines: string[]): number {\n  return lines.length;\n}\n`;
const REMOVE_CODE = `\n/** Removes a line from a cart. */\nexport function removeLine(lines: string[], line: string): string[] {\n  return lines.filter((candidate) => candidate !== line);\n}\n`;
const ADD_BOUNDED_CODE = `/** The most lines a cart holds. */\nconst MAX_LINES = 100;\n\n/** Adds a line to a cart. */\nexport function addLine(lines: string[], line: string): string[] {\n  return [...lines, line].slice(0, MAX_LINES);\n}\n`;
const ADD_MAGIC_CODE = `/** Adds a line to a cart. */\nexport function addLine(lines: string[], line: string): string[] {\n  return [...lines, line].slice(0, 100);\n}\n`;
const ADD_BRANCHING_CODE = `/** Adds a line to a cart. */\nexport function addLine(lines: string[], line: string): string[] {\n  if (lines.length > 99) {\n    return lines;\n  }\n  return lines.includes(line) || line === "" ? [...lines, line] : [...lines, line];\n}\n`;
const UNIT_FAILING_CODE = "export function addLine(lines: string[], line: string): string[] {\n  return lines;\n}\n";
const TYPE_ERROR_CODE = `/** Adds a line to a cart. */\nexport function addLine(lines: string[], line: string): number {\n  const added: string[] = [...lines, line];\n  return added;\n}\n`;

export const CART_CODE = {
  unitOnly: ADD_CODE,
  withCount: `${ADD_CODE}${COUNT_CODE}`,
  dedupedUnitOnly: ADD_ONCE_CODE,
  withRemove: `${ADD_CODE}${COUNT_CODE}${REMOVE_CODE}`,
  withTypeError: TYPE_ERROR_CODE,
  withMagicNumber: `${ADD_MAGIC_CODE}${COUNT_CODE}`,
  refactored: `${ADD_BOUNDED_CODE}${COUNT_CODE}`,
  moreComplex: `${ADD_BRANCHING_CODE}${COUNT_CODE}`,
  unitFailing: `${UNIT_FAILING_CODE}${COUNT_CODE}`,
} as const;

/** The unit test of the project that exists before the run: it passes, and its comment is a marker the tasks must not carry. */
export const EXISTING_UNIT_TEST = `// cart-test-marker\nimport { expect, it } from "vitest";\n\nit("starts at zero", () => {\n  expect(0).toBe(0);\n});\n`;

export const TSCONFIG = `${JSON.stringify({ compilerOptions: { target: "es2022", module: "nodenext", moduleResolution: "nodenext", strict: true, noEmit: true, types: [] }, include: ["src"] })}\n`;
