import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { codeSince, withoutCodeSince, withoutCycleCode } from "../../src/artifacts/cycle-code.js";
import { commitAll, git } from "./git-fixture.js";
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

describe("withoutCodeSince", () => {
  it("runs with the source as it was at a commit, also for files added and deleted since, and puts everything back byte for byte afterwards", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("src/b.ts", "export const b = 1;\n");
    write("tests/a.test.ts", "// old\n");
    commitAll();
    const base = git("rev-parse", "HEAD");
    write("src/a.ts", "export const a = 2;\n");
    rmSync(join(dir, "src/b.ts"));
    write("src/new.ts", "export const n = 1;\n");
    git("add", "-A");
    git("commit", "--quiet", "--message", "the scenario's code");
    write("src/untracked.ts", "export const u = 1;\n");
    write("tests/a.test.ts", "// new\n");
    const before = git("status", "--porcelain");
    expect(codeSince(dir, base, isSource).sort()).toEqual(["src/a.ts", "src/b.ts", "src/new.ts", "src/untracked.ts"]);
    const seen = withoutCodeSince(dir, base, isSource, () => [read("src/a.ts"), read("src/b.ts"), existsSync(join(dir, "src/new.ts")), existsSync(join(dir, "src/untracked.ts")), read("tests/a.test.ts")]);
    expect(seen).toEqual(["export const a = 1;\n", "export const b = 1;\n", false, false, "// new\n"]);
    expect([read("src/a.ts"), existsSync(join(dir, "src/b.ts")), read("src/new.ts"), read("src/untracked.ts"), git("status", "--porcelain")]).toEqual(["export const a = 2;\n", false, "export const n = 1;\n", "export const u = 1;\n", before]);
  });

  it("puts the code back when the run throws", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    const base = git("rev-parse", "HEAD");
    write("src/a.ts", "export const a = 2;\n");
    expect(() =>
      withoutCodeSince(dir, base, isSource, () => {
        expect(read("src/a.ts")).toBe("export const a = 1;\n");
        throw new Error("the run failed");
      }),
    ).toThrow("the run failed");
    expect(read("src/a.ts")).toBe("export const a = 2;\n");
  });
});
