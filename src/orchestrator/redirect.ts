/** The answers that have the agent try again, write the last unit test again, write the steps of the scenario again, skip the scenario or the feature, and abort the run. */
export const RETRY = "retry";
export const REWRITE = "rewrite";
export const REWRITE_STEPS = "rewrite_steps";
export const SKIP_SCENARIO = "skip_scenario";
export const SKIP_FR = "skip_fr";
export const ABORT = "abort";

/** What a person chose, other than retrying or aborting, when a state could not go on: the work moves somewhere else, and whoever runs the scenario or the feature takes it from there. */
export type RedirectAction = typeof REWRITE | typeof REWRITE_STEPS | typeof SKIP_SCENARIO | typeof SKIP_FR;

/** Thrown out of an attempt whose agent reported that it is blocked: the sentence that says why, for the person to read. */
export class Blocked extends Error {
  constructor(readonly problem: string) {
    super(problem);
  }
}

/** Thrown out of the state that asked, so that the loop that owns the scenario or the feature can change course: the action, why the state could not go on and what the person said. */
export class Redirect extends Error {
  constructor(readonly action: RedirectAction, readonly reason: string, readonly note: string) {
    super(`${action}: ${reason}`);
  }
}
