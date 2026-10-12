import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changesFromHead } from "../artifacts/checkpoint.js";
import { NEWLINE } from "../artifacts/lines.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { isInsideSource } from "../artifacts/source-roots.js";

/** How many characters of step definitions a person is shown. */
export const STEPS_LIMIT = 3000;
const NONE = "(the agent wrote no step definitions)";
const CUT = "(rest left out)";

/** The step files that were written or changed since `base`, each with its code, for a person to judge: at most `STEPS_LIMIT` characters, with a mark where the rest is left out. */
export function guardSteps(worktree: string, base: string): string {
  const { bdd_steps: globs } = loadProjectConfig(worktree).paths;
  const files = changesFromHead(worktree, base).present.filter((file) => isInsideSource(globs, file));
  if (files.length === 0) return NONE;
  const shown = files
    .map((file) => `${file}:${NEWLINE}${readFileSync(join(worktree, file), "utf8")}`)
    .sort((first, second) => first.length - second.length)
    .join(NEWLINE);
  return shown.length > STEPS_LIMIT ? `${shown.slice(0, STEPS_LIMIT)}${NEWLINE}${CUT}` : shown;
}
