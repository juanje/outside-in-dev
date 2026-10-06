import { describe, expect, it } from "vitest";
import { addedLines } from "../../src/artifacts/added-lines.js";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("addedLines", () => {
  it("is the lines of a file that differ from HEAD, and every line of a file HEAD does not have", () => {
    write("a.ts", "one\ntwo\nthree\n");
    commitAll();
    write("a.ts", "one\nTWO\nthree\nfour\n");
    write("new.ts", "x\ny\n");
    expect(addedLines(dir, "a.ts")).toEqual([
      { line: 2, text: "TWO" },
      { line: 4, text: "four" },
    ]);
    expect(addedLines(dir, "new.ts")).toEqual([
      { line: 1, text: "x" },
      { line: 2, text: "y" },
    ]);
  });

  it("is the lines that differ from the last checkpoint for a file it holds, and from HEAD for any other", () => {
    write("a.ts", "one\ntwo\nthree\n");
    write("b.ts", "b1\nb2\n");
    commitAll();
    write("a.ts", "one\nTWO\nthree\n");
    recordCheckpoint(dir, { step: "tdd_red", feature: null, verify: { kind: "red", target: "t" }, external: false, date: new Date() });
    write("a.ts", "one\nTWO\nthree\nfour\n");
    write("b.ts", "b1\nB2\n");
    expect(addedLines(dir, "a.ts")).toEqual([{ line: 4, text: "four" }]);
    expect(addedLines(dir, "b.ts")).toEqual([{ line: 2, text: "B2" }]);
  });
});
