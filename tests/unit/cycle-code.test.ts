import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { withoutCycleCode } from "../../src/artifacts/cycle-code.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED, isSource } from "./red-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const read = (name: string): string => readFileSync(join(dir, name), "utf8");

describe("withoutCycleCode", () => {
  it("runs with the source as it was at the last Red and puts the code back afterwards", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("tests/a.test.ts", "// old\n");
    commitAll();
    recordCheckpoint(dir, RED);
    write("src/a.ts", "export const a = 2;\n");
    write("src/new.ts", "export const n = 1;\n");
    write("tests/a.test.ts", "// new\n");
    const seen = withoutCycleCode(dir, FEATURE, isSource, () => [read("src/a.ts"), existsSync(join(dir, "src/new.ts")), read("tests/a.test.ts")]);
    expect(seen).toEqual(["export const a = 1;\n", false, "// new\n"]);
    expect([read("src/a.ts"), read("src/new.ts")]).toEqual(["export const a = 2;\n", "export const n = 1;\n"]);
  });

  it("puts the code back also when the run throws, and restores a file the cycle deleted", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("src/b.ts", "export const b = 1;\n");
    commitAll();
    recordCheckpoint(dir, RED);
    write("src/a.ts", "export const a = 2;\n");
    rmSync(join(dir, "src/b.ts"));
    expect(() =>
      withoutCycleCode(dir, FEATURE, isSource, () => {
        expect([read("src/a.ts"), read("src/b.ts")]).toEqual(["export const a = 1;\n", "export const b = 1;\n"]);
        throw new Error("the run failed");
      }),
    ).toThrow("the run failed");
    expect(read("src/a.ts")).toBe("export const a = 2;\n");
    expect(existsSync(join(dir, "src/b.ts"))).toBe(false);
  });
});
