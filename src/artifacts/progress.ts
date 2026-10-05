import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const PROGRESS_FILE = "progress.json";

export interface ScenarioProgress {
  name: string;
  bdd: string;
}

export interface FeatureProgress {
  id: string;
  title: string;
  status: string;
  cycle_step?: string;
  scenarios?: ScenarioProgress[];
}

export interface Progress {
  current_focus: string | null;
  features: FeatureProgress[];
}

/** An error whose message is meant to be shown to the user as is. */
export class ProgressError extends Error {}

export function loadProgress(cwd: string): Progress {
  const path = join(cwd, PROGRESS_FILE);
  if (!existsSync(path)) {
    throw new ProgressError(`${PROGRESS_FILE} not found in ${cwd}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Progress;
}
