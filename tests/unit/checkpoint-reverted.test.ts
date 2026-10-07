import { describe, expect, it } from "vitest";
import { changedSinceCheckpoint, recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll, git } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const DETAILS = { step: "tdd_red", feature: "FR-X-01", verify: { kind: "red", target: "t" }, external: false, date: new Date(0) };

describe("changedSinceCheckpoint after going back to HEAD", () => {
  it("reports a file the checkpoint recorded as changed that is now back to its content in HEAD", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    write("src/a.ts", "export const a = 2;\n");
    recordCheckpoint(dir, DETAILS);
    git("checkout", "--", "src/a.ts");
    expect(changedSinceCheckpoint(dir)).toEqual(["src/a.ts"]);
  });

  it("reports a file the checkpoint recorded as deleted that is back, and an untracked file of the snapshot that is gone", () => {
    write("src/a.ts", "export const a = 1;\n");
    commitAll();
    git("rm", "--quiet", "src/a.ts");
    write("src/new.ts", "export const n = 1;\n");
    recordCheckpoint(dir, DETAILS);
    git("checkout", "HEAD", "--", "src/a.ts");
    git("clean", "--quiet", "-f", "--", "src/new.ts");
    expect(changedSinceCheckpoint(dir).sort()).toEqual(["src/a.ts", "src/new.ts"]);
  });
});
