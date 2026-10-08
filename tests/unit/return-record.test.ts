import { describe, expect, it } from "vitest";
import { changedSinceReturn, readReturn, recordReturn } from "../../src/artifacts/return-record.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const FEATURE = "FR-X-01";

describe("the return record", () => {
  it("keeps the step the feature came from and the content of the tree, to tell what changed since", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    recordReturn(dir, FEATURE, "refactor");
    expect(readReturn(dir, FEATURE)?.from).toBe("refactor");
    expect(changedSinceReturn(dir, FEATURE)).toEqual([]);
    write("src/a.ts", "export const a = 2;\n");
    expect(changedSinceReturn(dir, FEATURE)).toEqual(["src/a.ts"]);
  });
});
