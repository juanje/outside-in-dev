import { type Models, type StartEffort, THINKING_LEVELS } from "../artifacts/user-config.js";

/** The model and the reasoning level one attempt of an agent runs with. */
export type Effort = { model?: string; thinkingLevel: string };

/** Which attempt this is (from 1), how many retries the state allows after the first attempt, and the models the user assigned. */
export type EffortRequest = { attempt: number; retries: number; models?: Models; start?: StartEffort };

/** The levels a task that writes code may run at, from the lowest. */
const LEVELS: readonly string[] = THINKING_LEVELS;
const FIRST_LEVEL = LEVELS.indexOf("medium");

/** The effort of an attempt: the first runs at the level and on the model role that the user set for the state, by default the default model at the medium level; each retry goes one level higher, up to the highest, on the same role; the last attempt, and any after it, runs on the strong model at the highest level. */
export function attemptEffort({ attempt, retries, models, start }: EffortRequest): Effort {
  if (attempt > 1 && attempt > retries) return { model: models?.strong, thinkingLevel: LEVELS[LEVELS.length - 1]! };
  const first = start === undefined ? FIRST_LEVEL : LEVELS.indexOf(start.thinking);
  return { model: models?.[start?.model ?? "default"], thinkingLevel: LEVELS[Math.min(first + attempt - 1, LEVELS.length - 1)]! };
}
