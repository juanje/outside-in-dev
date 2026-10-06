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

/** Records the checkpoint of a verification that passed, with the feature in focus. */
export function recordVerified(cwd: string, config: ProjectConfig, details: Omit<CheckpointDetails, "feature" | "date">): void {
  const feature = existsSync(join(cwd, config.paths.progress)) ? loadProgress(cwd, config.paths.progress).current_focus : null;
  recordCheckpoint(cwd, { ...details, feature, date: new Date() });
}
