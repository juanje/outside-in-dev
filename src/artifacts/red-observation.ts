import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.js";
import { changedSince, hasHead, JSON_INDENT, OID_DIR, treeState } from "./checkpoint.js";
import { ProgressError } from "./progress.js";
import { readJson } from "./project-json.js";

const OBSERVATION_FILE = `${OID_DIR}/red-observation.json`;
const LIST_SEPARATOR = ", ";

/** What the last `oid verify red` observed: its target, the step it verifies, the failure it printed and whether the failure needs a decision. */
export interface RedObservation {
  target: string;
  step: string;
  message: string;
  needsDecision: boolean;
}

const observationSchema = z.object({
  target: z.string(),
  step: z.string(),
  message: z.string(),
  needsDecision: z.boolean(),
  snapshot: z.record(z.string(), z.string()),
  deleted: z.array(z.string()),
});

/** Records what `oid verify red` just observed, bound to the content of the working tree it ran on, in place of the previous observation; outside a git repository with a commit there is no content to bind it to, and the previous one is removed. */
export function recordObservation(cwd: string, observation: RedObservation): void {
  if (!hasHead(cwd)) {
    rmSync(join(cwd, OBSERVATION_FILE), { force: true });
    return;
  }
  const { snapshot, deleted } = treeState(cwd);
  mkdirSync(join(cwd, OID_DIR), { recursive: true });
  writeFileAtomic(join(cwd, OBSERVATION_FILE), `${JSON.stringify({ ...observation, snapshot, deleted }, null, JSON_INDENT)}\n`);
}

/** The recorded observation of `target` that a decision answers; refused when none needs a decision, or when files other than the progress file changed since it. */
export function observationToDecide(cwd: string, target: string, progressFile: string): RedObservation {
  const parsed = observationSchema.safeParse(readJson(cwd, OBSERVATION_FILE));
  const recorded = parsed.success && parsed.data.target === target && parsed.data.needsDecision ? parsed.data : undefined;
  if (recorded === undefined) throw new ProgressError(`--decide is refused: no recorded run of this target needs a decision; run oid verify red "${target}" first`);
  const changed = changedSince(cwd, recorded).filter((file) => file !== progressFile);
  if (changed.length > 0) {
    throw new ProgressError(`--decide is refused: ${changed.join(LIST_SEPARATOR)} changed since the run that needs the decision; run oid verify red "${target}" again`);
  }
  const { snapshot: _snapshot, deleted: _deleted, ...observation } = recorded;
  return observation;
}
