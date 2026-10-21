import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAssertionFailure, MutantError, mutantFiles, withMutant } from "../../src/artifacts/mutant.js";
import { FAILURE, type Failure } from "../../src/artifacts/red-classification.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write } from "./temp-project.js";

useTempDir();

const read = (name: string): string => readFileSync(join(dir, name), "utf8");

const CHANGE = ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "-export const a = 1;", "+export const a = 2;", ""].join("\n");
const CREATE = ["--- /dev/null", "+++ b/src/new.ts", "@@ -0,0 +1 @@", "+export const n = 1;", ""].join("\n");
const DELETE = ["--- a/src/b.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-export const b = 1;", ""].join("\n");

const PURE_RENAME = ["diff --git a/tests/t.ts b/src/t.ts", "similarity index 100%", "rename from tests/t.ts", "rename to src/t.ts", ""].join("\n");
const RENAME_WITH_CHANGE = [
  "diff --git a/tests/u.ts b/src/u.ts",
  "similarity index 50%",
  "rename from tests/u.ts",
  "rename to src/u.ts",
  "--- a/tests/u.ts",
  "+++ b/src/u.ts",
  "@@ -1 +1 @@",
  "-export const u = 1;",
  "+export const u = 2;",
  "",
].join("\n");

describe("mutantFiles", () => {
  it("lists each file the diff changes once, the new one and the deleted one included", () => {
    expect(mutantFiles(`${CHANGE}${CREATE}${DELETE}${CHANGE}`, dir)).toEqual(["src/a.ts", "src/new.ts", "src/b.ts"]);
  });

  it("lists nothing for a text that holds no diff", () => {
    expect(mutantFiles("not a diff\n", dir)).toEqual([]);
  });

  it("lists both the old and the new path of a rename, with or without a change of content", () => {
    expect([PURE_RENAME, RENAME_WITH_CHANGE].map((diff) => mutantFiles(diff, dir).sort())).toEqual([
      ["src/t.ts", "tests/t.ts"],
      ["src/u.ts", "tests/u.ts"],
    ]);
  });
});

describe("withMutant", () => {
  it("runs with the diff applied and puts the source back afterwards", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write("src/a.ts", "export const a = 1;\n");
    expect(withMutant(dir, CHANGE, () => read("src/a.ts"))).toBe("export const a = 2;\n");
    expect(read("src/a.ts")).toBe("export const a = 1;\n");
  });

  it("puts the source back also when the run throws", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write("src/a.ts", "export const a = 1;\n");
    expect(() =>
      withMutant(dir, CHANGE, () => {
        throw new Error("the run failed");
      }),
    ).toThrow("the run failed");
    expect(read("src/a.ts")).toBe("export const a = 1;\n");
  });

  it("removes a file the diff created and brings back a file the diff deleted", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write("src/b.ts", "export const b = 1;\n");
    const seen = withMutant(dir, `${CREATE}${DELETE}`, () => [existsSync(join(dir, "src/new.ts")), existsSync(join(dir, "src/b.ts"))]);
    expect(seen).toEqual([true, false]);
    expect([existsSync(join(dir, "src/new.ts")), read("src/b.ts")]).toEqual([false, "export const b = 1;\n"]);
  });

  it("brings back the old path of a rename and removes the new one", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write("tests/t.ts", "export const t = 1;\n");
    write("tests/u.ts", "export const u = 1;\n");
    const seen = withMutant(dir, `${PURE_RENAME}${RENAME_WITH_CHANGE}`, () => ["tests/t.ts", "src/t.ts", "tests/u.ts", "src/u.ts"].map((name) => existsSync(join(dir, name))));
    expect(seen).toEqual([false, true, false, true]);
    expect(["tests/t.ts", "src/t.ts", "tests/u.ts", "src/u.ts"].map((name) => existsSync(join(dir, name)))).toEqual([true, false, true, false]);
    expect([read("tests/t.ts"), read("tests/u.ts")]).toEqual(["export const t = 1;\n", "export const u = 1;\n"]);
  });

  it("refuses a diff that does not apply, without running anything and leaving the source as it was", { timeout: REAL_PROCESS_TIMEOUT_MS }, () => {
    write("src/a.ts", "export const a = 5;\n");
    let ran = false;
    expect(() => withMutant(dir, CHANGE, () => (ran = true))).toThrow(MutantError);
    expect(() => withMutant(dir, CHANGE, () => (ran = true))).toThrow(/does not apply/);
    expect([ran, read("src/a.ts")]).toEqual([false, "export const a = 5;\n"]);
  });
});

describe("isAssertionFailure", () => {
  const error = (message: string, extra: object = {}): Failure => ({ kind: FAILURE.error, message, ...extra });
  it("is true only for a test that ran and failed an assertion", () => {
    const answers = [
      { kind: FAILURE.passed } as Failure,
      error("AssertionError: expected 'Goodbye, Ann' to be 'Hello, Ann'\n    at x"),
      error("AssertionError [ERR_ASSERTION]: false == true"),
      error("TypeError: (0 , greet) is not a function"),
      error("Error: ENOENT: no such file or directory, open 'x'"),
      error("AssertionError: expected 1 to be 2", { step: "Given a thing", setup: true }),
      { kind: FAILURE.load, message: "Cannot find module '../../src/nope.js' imported from '/p/tests/a.test.ts'" } as Failure,
      error("Error: Cannot find module '../../src/nope.js' imported from '/p/tests/a.test.ts'"),
      { kind: FAILURE.noReport, runner: "unit", exitCode: 1 } as Failure,
    ].map((failure) => isAssertionFailure(dir, failure));
    expect(answers).toEqual([false, true, true, false, false, false, false, false, false]);
  });
});
