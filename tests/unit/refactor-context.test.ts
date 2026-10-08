import { describe, expect, it } from "vitest";
import { refactorContext } from "../../src/orchestrator/refactor-findings.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("the context of a refactor task", () => {
  it("lists each finding with the code of its lines, then the file in full and the reuse catalogue, and holds no test", () => {
    writeMinimalConfig();
    write("src/cart.ts", ["/** Adds a line. */", "export function addLine(lines: string[]): string[] {", "  return lines.slice(0, 100);", "}", ""].join("\n"));
    write("tests/unit/cart.test.ts", "// TEST-MARK\n");
    const context = refactorContext(dir, [{ id: "magic-0001", category: "magic_value", file: "src/cart.ts", range: { start: 3, end: 3 }, detail: "the number 100" }]);
    expect(context).toContain("magic_value src/cart.ts:3-3 the number 100");
    expect(context).toContain("  return lines.slice(0, 100);");
    expect(context).toContain("### src/cart.ts");
    expect(context).toContain("addLine(lines: string[]): string[]");
    expect(context).not.toContain("TEST-MARK");
  });
});
