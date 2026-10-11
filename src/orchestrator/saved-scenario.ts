import { ProgressError } from "../artifacts/progress.js";
import type { RedScenario } from "./run-bdd-red.js";
import type { RunSession } from "./session.js";

/** What separates the feature file from the line in a saved location. */
const LOCATION_SEPARATOR = ":";

/** The scenario of the inner loop as the session saved it, with the failure it showed last. */
export function savedScenario(saved: RunSession): RedScenario {
  const { scenario, fr } = saved;
  if (scenario === undefined || fr === undefined) throw new ProgressError(`the session of the run ${saved.runId} names no scenario for ${saved.state}`);
  const at = scenario.location.lastIndexOf(LOCATION_SEPARATOR);
  return { current: { file: scenario.location.slice(0, at), line: Number(scenario.location.slice(at + 1)), name: scenario.name }, label: `${fr} "${scenario.name}"`, failure: saved.scenarioFailure ?? "" };
}
