import { describe, expect, it } from "vitest";
import { changedSinceRedBase, recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { FEATURE, RED } from "./red-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("the Red base of a feature", () => {
  it("is the last Red checkpoint, kept when a Green replaces the checkpoint of the feature", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    recordCheckpoint(dir, RED);
    write("src/new.ts", "export const n = 1;\n");
    recordCheckpoint(dir, { ...RED, step: "tdd_green", verify: { kind: "green", target: "all" } });
    expect(changedSinceRedBase(dir, FEATURE)).toEqual(["src/new.ts"]);
  });
});
