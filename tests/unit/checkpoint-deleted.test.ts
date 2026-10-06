import { rmSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { changedSinceCheckpoint, recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

it("counts a file deleted since the checkpoint as changed, and one the checkpoint already saw deleted as unchanged", () => {
  write("a.ts", "a\n");
  write("b.ts", "b\n");
  commitAll();
  rmSync(join(dir, "a.ts"));
  recordCheckpoint(dir, { step: "tdd_red", feature: null, verify: { kind: "red", target: "t" }, external: false, date: new Date() });
  expect(changedSinceCheckpoint(dir)).toEqual([]);
  rmSync(join(dir, "b.ts"));
  expect(changedSinceCheckpoint(dir)).toEqual(["b.ts"]);
});
