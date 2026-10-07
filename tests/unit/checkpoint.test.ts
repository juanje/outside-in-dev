import { createHash } from "node:crypto";
import { readFileSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProgressError } from "../../src/artifacts/progress.js";
import { changedSinceCheckpoint, recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const DETAILS = { step: "tdd_red", feature: "FR-X-01", verify: { kind: "red", target: "tests/a.test.ts > adds" }, external: false, date: new Date("2026-10-06T12:00:00Z") };

function readCheckpoint(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, `.outside-in/checkpoints/${DETAILS.feature}.json`), "utf8"));
}

describe("recordCheckpoint", () => {
  it("writes what was verified and a hash of every modified or untracked file, and leaves the committed ones out", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("src/b.ts", "export const b = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    write("tests/a.test.ts", "// new\n");
    recordCheckpoint(dir, DETAILS);
    expect(readCheckpoint()).toEqual({
      step: "tdd_red",
      feature: "FR-X-01",
      verify: { kind: "red", target: "tests/a.test.ts > adds" },
      date: "2026-10-06T12:00:00.000Z",
      external: false,
      snapshot: { "src/a.ts": sha256("export const a = 2;\n"), "tests/a.test.ts": sha256("// new\n") },
      deleted: [],
      scenarios: [],
    });
  });

  it("lists a committed file that was deleted instead of hashing it", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("src/b.ts", "export const b = 1;\n");
    commitAll();
    unlinkSync(join(dir, "src/b.ts"));
    recordCheckpoint(dir, DETAILS);
    expect(readCheckpoint()).toMatchObject({ snapshot: {}, deleted: ["src/b.ts"] });
  });

  it("leaves out oid's own directory and anything that is not a regular file", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    write(".outside-in/baseline.json", "[]\n");
    symlinkSync(join(dir, "src"), join(dir, "linked"), "dir");
    write("src/new.ts", "export const n = 1;\n");
    recordCheckpoint(dir, DETAILS);
    expect(Object.keys(readCheckpoint().snapshot as object)).toEqual(["src/new.ts"]);
  });

  it("refuses a project that is not a git repository with a commit, recording nothing", () => {
    write("src/a.ts", "export const a = 1;\n");
    expect(() => recordCheckpoint(dir, DETAILS)).toThrow(new ProgressError("a checkpoint compares with HEAD: this directory is not a git repository with a commit"));
  });
});

describe("changedSinceCheckpoint", () => {
  it("lists the files that differ from HEAD when there is no checkpoint: modified, untracked and deleted", () => {
    write("src/a.ts", "export const a = 1;\n");
    write("src/b.ts", "export const b = 1;\n");
    write("src/c.ts", "export const c = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    write("src/new.ts", "export const n = 1;\n");
    unlinkSync(join(dir, "src/b.ts"));
    expect(changedSinceCheckpoint(dir, DETAILS.feature).sort()).toEqual(["src/a.ts", "src/b.ts", "src/new.ts"]);
  });

  it("leaves out what the checkpoint holds unchanged, and lists what changed or appeared after it", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    write("tests/kept.test.ts", "// kept\n");
    write("tests/edited.test.ts", "// first\n");
    recordCheckpoint(dir, DETAILS);
    write("tests/edited.test.ts", "// second\n");
    write("tests/later.test.ts", "// later\n");
    expect(changedSinceCheckpoint(dir, DETAILS.feature).sort()).toEqual(["tests/edited.test.ts", "tests/later.test.ts"]);
  });
});
