import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CheckpointDetails, recordCheckpoint } from "./checkpoint.js";
import { loadProgress, ProgressError } from "./progress.js";
import { CONFIG_FILE, parseProjectConfig, type ProjectConfig } from "./project-config.js";
import { readJson } from "./project-json.js";

/** The project configuration; verification runs the commands it holds. */
export function loadVerifyConfig(cwd: string): ProjectConfig {
  const document = readJson(cwd, CONFIG_FILE);
  if (document === undefined) throw new ProgressError(`${CONFIG_FILE} not found: oid verify runs the commands it holds; run oid init first`);
  return parseProjectConfig(document);
}

/** The feature in focus, whose checkpoint a verification records and is judged against; none without a progress file. */
export function focusedFeature(cwd: string, config: ProjectConfig): string | null {
  return existsSync(join(cwd, config.paths.progress)) ? loadProgress(cwd, config.paths.progress).current_focus : null;
}

/** Records the checkpoint of a verification that passed for the feature in focus and for each of `features`, leaving the checkpoints of the others as they are; with no feature at all, the single checkpoint. */
export function recordVerified(cwd: string, config: ProjectConfig, details: Omit<CheckpointDetails, "feature" | "date">, features: string[] = []): void {
  const focus = focusedFeature(cwd, config);
  const judged = [...new Set([...(focus === null ? [] : [focus]), ...features])];
  const date = new Date();
  for (const feature of judged.length === 0 ? [null] : judged) recordCheckpoint(cwd, { ...details, feature, date });
}
