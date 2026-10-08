import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readChangedLines } from "../../src/artifacts/git-changes.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("readChangedLines since a commit", () => {
  it("reads the lines that the commits after the given one changed, and none of the earlier ones", () => {
    writeFileSync(join(dir, "a.ts"), "one\ntwo\nthree\n");
    commitAll();
    const first = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "a.ts"), "one\nTWO\nthree\n");
    git("commit", "--quiet", "--all", "--message", "second");
    expect(readChangedLines(dir, first)).toEqual(new Map([["a.ts", [{ start: 2, end: 2 }]]]));
    expect(readChangedLines(dir)).toEqual(new Map());
  });
});
