import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.js";
import { changedSince, CHECKPOINTS_DIR, JSON_INDENT, treeState } from "./checkpoint.js";
import { readJson } from "./project-json.js";

const returnSchema = z.object({
  from: z.string(),
  snapshot: z.record(z.string(), z.string()),
  deleted: z.array(z.string()),
});

/** Where a feature came from when it went back to `bdd_red`, and the content of the tree then. */
export type ReturnRecord = z.infer<typeof returnSchema>;

function returnFile(feature: string): string {
  return `${CHECKPOINTS_DIR}/${feature}.return.json`;
}

/** Records that `feature` went back to `bdd_red` from the step `from`, with the content of the working tree now. */
export function recordReturn(cwd: string, feature: string, from: string): void {
  const { snapshot, deleted } = treeState(cwd);
  mkdirSync(dirname(join(cwd, returnFile(feature))), { recursive: true });
  writeFileAtomic(join(cwd, returnFile(feature)), `${JSON.stringify({ from, snapshot, deleted }, null, JSON_INDENT)}\n`);
}

/** The return recorded for `feature`, if any. */
export function readReturn(cwd: string, feature: string): ReturnRecord | undefined {
  const parsed = returnSchema.safeParse(readJson(cwd, returnFile(feature)));
  return parsed.success ? parsed.data : undefined;
}

/** The files whose state is not the one the return of `feature` recorded. */
export function changedSinceReturn(cwd: string, feature: string): string[] {
  const record = readReturn(cwd, feature);
  return record === undefined ? [] : changedSince(cwd, record);
}

/** Forgets the return recorded for `feature`, if any. */
export function clearReturn(cwd: string, feature: string): void {
  rmSync(join(cwd, returnFile(feature)), { force: true });
}
