import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changesSince, snapshotWorktree } from "../../src/agents/worktree-changes.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("changesSince", () => {
  it("lists the files changed, added and deleted since the snapshot, untracked ones included, and leaves out what was already dirty and stayed the same", () => {
    write("src/a.ts", "a\n");
    write("src/b.ts", "b\n");
    write("src/c.ts", "c\n");
    write("src/dirty.ts", "d\n");
    write("src/reverted.ts", "r\n");
    commitAll();
    write("src/dirty.ts", "dirty before\n");
    write("src/reverted.ts", "dirty before\n");
    const before = snapshotWorktree(dir);

    write("src/a.ts", "changed\n");
    write("src/new/d.ts", "added\n");
    rmSync(join(dir, "src/b.ts"));
    write("src/reverted.ts", "r\n");

    expect(changesSince(dir, before)).toEqual(["src/a.ts", "src/b.ts", "src/new/d.ts", "src/reverted.ts"]);
  });
});
