import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "./atomic-write.js";
import { changedSince, CHECKPOINTS_DIR, JSON_INDENT, treeState } from "./checkpoint.js";
import { scenarioTexts } from "./feature-approval.js";
import { type FeatureProgress, ProgressError } from "./progress.js";
import type { ProjectPaths } from "./project-paths.js";
import { readJson } from "./project-json.js";
import { requireGreenRan } from "./scenario-evidence.js";
import { isInsideSource } from "./source-roots.js";
import { listLocatedScenarios, readFeatureSources } from "./traceability.js";

const scenarioSchema = z.object({ name: z.string(), text: z.string(), tags: z.array(z.string()) });
const reviseSchema = z.object({
  snapshot: z.record(z.string(), z.string()),
  deleted: z.array(z.string()),
  scenarios: z.array(scenarioSchema),
});

/** The content of the tree and the scenarios of a feature at the moment its requirement was revised. */
export type ReviseRecord = z.infer<typeof reviseSchema>;
type ScenarioState = z.infer<typeof scenarioSchema>;

function reviseFile(feature: string): string {
  return `${CHECKPOINTS_DIR}/${feature}.revise.json`;
}

/** The scenarios of `feature` as they are now: those tagged with it in the feature files and those registered in progress, by name; a registered one with no tagged scenario has no text and no tags. */
function scenariosOf(cwd: string, paths: ProjectPaths, feature: FeatureProgress): ScenarioState[] {
  const tagged = readFeatureSources(cwd, paths.features)
    .flatMap(({ text }) => scenarioTexts(text))
    .filter(({ tags }) => tags.includes(`@${feature.id}`));
  const registered = (feature.scenarios ?? []).filter(({ name }) => !tagged.some((scenario) => scenario.name === name)).map(({ name }) => ({ name, text: "", tags: [] }));
  return [...tagged, ...registered];
}

/** Records that the requirement of `feature` was revised: the content of the working tree now, and its scenarios. */
export function recordRevise(cwd: string, paths: ProjectPaths, feature: FeatureProgress): void {
  const { snapshot, deleted } = treeState(cwd);
  const file = join(cwd, reviseFile(feature.id));
  mkdirSync(dirname(file), { recursive: true });
  writeFileAtomic(file, `${JSON.stringify({ snapshot, deleted, scenarios: scenariosOf(cwd, paths, feature) }, null, JSON_INDENT)}\n`);
}

/** The revise recorded for `feature`, if any. */
export function readRevise(cwd: string, feature: string): ReviseRecord | undefined {
  const parsed = reviseSchema.safeParse(readJson(cwd, reviseFile(feature)));
  return parsed.success ? parsed.data : undefined;
}

/** Forgets the revise recorded for `feature`, if any. */
export function clearRevise(cwd: string, feature: string): void {
  rmSync(join(cwd, reviseFile(feature)), { force: true });
}

const LIST_SEPARATOR = ", ";

/** What differs between the scenarios at the revise and now: each one added, or changed in text or tags. Removing is not a difference. */
function differences(before: ScenarioState[], now: ScenarioState[]): string[] {
  return now.flatMap((scenario) => {
    const was = before.find(({ name }) => name === scenario.name);
    if (was === undefined) return [`"${scenario.name}" was added`];
    const same = was.text === scenario.text && JSON.stringify([...was.tags].sort()) === JSON.stringify([...scenario.tags].sort());
    return same ? [] : [`"${scenario.name}" changed`];
  });
}

/** The command of the green that runs every scenario of `feature` tagged in the feature files. */
function greenCommand(cwd: string, paths: ProjectPaths, feature: string): string {
  const where = listLocatedScenarios(readFeatureSources(cwd, paths.features))
    .filter(({ tags }) => tags.includes(`@${feature}`))
    .map(({ file, line }) => `${file}:${line}`);
  return `run: oid verify green${where.length === 0 ? " <feature>:<line>" : where.map((place) => ` ${place}`).join("")}`;
}

/**
 * Refuses unless `feature` may go from `bdd_red` to `quality_gate` after a revise that needed no code (ADR-041): a revise record exists, no source or step file
 * changed since, the scenarios are only removed or moved out, and the last green ran every one of them with nothing changed since but the progress file and oid's own files.
 */
export function requireReviseExit(cwd: string, paths: ProjectPaths, feature: FeatureProgress): void {
  const refusal = `${feature.id} cannot go from bdd_red to quality_gate`;
  const record = readRevise(cwd, feature.id);
  if (record === undefined) throw new ProgressError(`${refusal}: there is no revise record; only a feature the human revised with \`oid progress revise\` can leave bdd_red without a Red`);
  const code = changedSince(cwd, record).filter((file) => isInsideSource(paths.source, file) || isInsideSource(paths.steps, file));
  if (code.length > 0) throw new ProgressError(`${refusal}: source or step files changed since the revise: ${code.join(LIST_SEPARATOR)}`);
  const now = scenariosOf(cwd, paths, feature);
  const changed = differences(record.scenarios, now);
  if (changed.length > 0) throw new ProgressError(`${refusal}: scenarios differ from the revise (they may only be removed): ${changed.join(LIST_SEPARATOR)}`);
  requireGreenRan(cwd, feature.id, now.map(({ name }) => name), refusal, greenCommand(cwd, paths, feature.id));
}
