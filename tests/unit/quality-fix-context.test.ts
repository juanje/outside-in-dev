import { describe, expect, it } from "vitest";
import { qualityFixContext } from "../../src/orchestrator/quality-fix-context.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("the context of a quality fix", () => {
  it("lists each error with its location and holds the files that have errors in full, and nothing else", () => {
    write("src/cart.ts", "export const a = 1; // TODO\nexport const b = 2;\n");
    write("src/totals.ts", "export const total = 0;\n");
    const context = qualityFixContext(dir, [
      { kind: "lint", file: "src/cart.ts", line: 1, code: "no-todo", message: "Unexpected TODO comment." },
      { kind: "lint", file: "src/cart.ts", line: 2, code: "no-const", message: "Unexpected const." },
    ]);
    expect(context).toContain("lint src/cart.ts:1 no-todo Unexpected TODO comment.\nlint src/cart.ts:2 no-const Unexpected const.");
    expect(context.match(/### src\/cart\.ts/g)).toHaveLength(1);
    expect(context).toContain("### src/cart.ts\nexport const a = 1; // TODO\nexport const b = 2;");
    expect(context).not.toContain("totals");
  });
});
