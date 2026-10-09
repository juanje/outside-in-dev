import type { ProjectConfig } from "../artifacts/project-config.js";

/** The model and the reasoning level one attempt of an agent runs with. */
export type Effort = { model?: string; thinkingLevel: string };

/** Which attempt this is (from 1), how many retries the state allows after the first attempt, and the models the project names. */
export type EffortRequest = { attempt: number; retries: number; models?: ProjectConfig["models"] };

/** The levels a task that writes code may run at, from the lowest. */
const LEVELS = ["minimal", "low", "medium", "high"];
const FIRST_LEVEL = LEVELS.indexOf("medium");

/** The effort of an attempt: the first runs on the default model at the medium level, until effort scoring exists; each retry goes one level higher, up to the highest; the last attempt, and any after it, runs on the strong model at the highest level. */
export function attemptEffort({ attempt, retries, models }: EffortRequest): Effort {
  if (attempt > 1 && attempt > retries) return { model: models?.strong, thinkingLevel: LEVELS[LEVELS.length - 1]! };
  return { model: models?.default, thinkingLevel: LEVELS[Math.min(FIRST_LEVEL + attempt - 1, LEVELS.length - 1)]! };
}
