import { describe, expect, it } from "vitest";
import { resolveImportedSymbol } from "../../src/artifacts/project-symbol.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const TEST_FILE = "tests/unit/a.test.ts";

describe("resolveImportedSymbol", () => {
  it("finds a name that the project module it is imported from does not export", () => {
    write("src/greeting.ts", "export function greet(): string { return 'hi'; }\n");
    write(TEST_FILE, 'import { shout } from "../../src/greeting.js";\nshout();\n');
    expect(resolveImportedSymbol(dir, TEST_FILE, "shout")).toBe("missing");
  });

  it("treats a name imported from a package, or not imported at all, as not from the project", () => {
    write(TEST_FILE, 'import { padLeft } from "left-padz";\npadLeft();\nlocal();\n');
    expect([resolveImportedSymbol(dir, TEST_FILE, "padLeft"), resolveImportedSymbol(dir, TEST_FILE, "local")]).toEqual(["external", "external"]);
  });

  it("finds a name that the module re-exports, whatever local name the test gives it", () => {
    write("src/shout.ts", "export function shout(): string { return 'HI'; }\n");
    write("src/index.ts", 'export * from "./shout.js";\n');
    write(TEST_FILE, 'import { shout as loud } from "../../src/index.js";\nloud();\n');
    expect(resolveImportedSymbol(dir, TEST_FILE, "shout")).toBe("exists");
  });

  it("follows a name that a step takes from a dynamic import of a project module", () => {
    write("src/greeting.ts", "export const greeting = 'hi';\n");
    write("features/steps/a.steps.ts", 'Then("it", async function () {\n  const { greeting, shout } = await import("../../src/greeting.js");\n  shout(greeting);\n});\n');
    expect([resolveImportedSymbol(dir, "features/steps/a.steps.ts", "shout"), resolveImportedSymbol(dir, "features/steps/a.steps.ts", "greeting")]).toEqual(["missing", "exists"]);
  });
});
