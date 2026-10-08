import { BDD_RED, CODE_GREEN, TDD_RED } from "../agents/profiles.js";
import { CYCLE_STEP } from "../artifacts/progress.js";
import type { GateError } from "../artifacts/lint-tools.js";
import type { ProjectConfig } from "../artifacts/project-config.js";
import { isInsideSource } from "../artifacts/source-roots.js";

/** The errors of one kind of file, and who fixes them: the name of the files in the task, the profile of the agent that owns them and the cycle step its integrity is judged in. */
export type FixGroup = { owner: string; state: typeof CODE_GREEN | typeof TDD_RED | typeof BDD_RED; step: string; errors: GateError[] };

/** The owners in the order their errors are fixed, and the globs of the project that name their files. */
const OWNERS = [
  { owner: "source files", state: CODE_GREEN, step: CYCLE_STEP.tddGreen, globs: (paths: ProjectConfig["paths"]) => paths.source },
  { owner: "unit tests", state: TDD_RED, step: CYCLE_STEP.tddRed, globs: (paths: ProjectConfig["paths"]) => paths.unit_tests },
  { owner: "step definitions", state: BDD_RED, step: CYCLE_STEP.bddRed, globs: (paths: ProjectConfig["paths"]) => paths.bdd_steps },
] as const;

/** Splits errors by the agent that owns their file: unit tests and steps first (they may lie under the source globs), and the errors of files nobody owns apart. */
export function fixGroups(errors: GateError[], paths: ProjectConfig["paths"]): { groups: FixGroup[]; unowned: GateError[] } {
  const ownerOf = (file: string) => [...OWNERS].reverse().find(({ globs }) => file !== "" && isInsideSource(globs(paths), file));
  const groups = OWNERS.map(({ owner, state, step }) => ({ owner, state, step, errors: errors.filter(({ file }) => ownerOf(file)?.owner === owner) }));
  return { groups: groups.filter((group) => group.errors.length > 0), unowned: errors.filter(({ file }) => ownerOf(file) === undefined) };
}
