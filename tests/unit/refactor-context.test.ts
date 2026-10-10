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

  it("gives the signatures of the modules with findings first, and the other modules by path when the catalogue is over its budget", () => {
    writeMinimalConfig();
    const long = "x".repeat(1000);
    for (let n = 0; n < 40; n++) write(`src/filler${n}.ts`, `/** ${long} */\nexport function filler${n}(): void {}\n`);
    write("src/zed.ts", `/** Zed ${long} */\nexport function zed(): number {\n  return 100;\n}\n`);
    const context = refactorContext(dir, [{ id: "magic-0001", category: "magic_value", file: "src/zed.ts", range: { start: 3, end: 3 }, detail: "the number 100" }]);
    expect(context).toContain("- `function zed(): number` Zed x");
    expect(context).toContain("Other modules (signatures not shown, read the file when you need it):\n- src/filler");
  });
});
