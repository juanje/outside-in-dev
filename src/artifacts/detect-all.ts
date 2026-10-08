import { detectCommentedOutCode, detectComplexity, detectDocDrift, detectDuplication, detectMagicValues, detectUnusedCode, detectUnusedDeclarations } from "./code-health.js";
import type { FindingDraft } from "./findings.js";
import { loadComplexityLimits, loadDuplicationLimits, loadMagicValueLimits, loadRefactorEntry } from "./project-config.js";
import { readJson, TSCONFIG_FILE } from "./project-json.js";
import { loadProjectPaths, type ProjectPaths } from "./project-paths.js";

/** What finds the code-health findings of a project directory: the detectors of `oid metrics`, or a scripted one in a test. */
export type Detector = (cwd: string) => FindingDraft[];

/** The findings of every detector over the project in `cwd`, for its source and test globs. */
export function detectAll(cwd: string, paths: ProjectPaths): FindingDraft[] {
  return [
    ...detectComplexity(cwd, paths, loadComplexityLimits(cwd)),
    ...detectDuplication(cwd, paths, loadDuplicationLimits(cwd)),
    ...detectUnusedCode(cwd, paths, loadRefactorEntry(cwd)),
    ...detectUnusedDeclarations(cwd, paths),
    ...detectCommentedOutCode(cwd, paths),
    ...detectDocDrift(cwd, paths),
    ...detectMagicValues(cwd, paths, loadMagicValueLimits(cwd)),
  ];
}

/** The detectors of `oid metrics` over the project in `cwd`, with the paths of its configuration; a project with no tsconfig.json has no TypeScript code to analyse and no findings. */
export const detectProject: Detector = (cwd) => (readJson(cwd, TSCONFIG_FILE) === undefined ? [] : detectAll(cwd, loadProjectPaths(cwd)));
