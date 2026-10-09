/** The scenarios that run the real runners (real cucumber, vitest, tsc, detectors), by FR; every other `oid run` scenario replays recorded reports. A unit test checks that each name exists exactly once in its feature file with the tag of its FR: renaming a scenario means updating this table. No cucumber imports: the unit tests read it too. */
export const REAL_RUNNER_SCENARIOS = {
  /** The one scenario of FR-RUN-03 that runs the real cucumber, in the baseline and in the gate. */
  "FR-RUN-03": "A scenario that fails because the code is missing is checkpointed and moves the run to TDD Red",
  "FR-RUN-04": "A failing unit test and the code that passes it turn the scenario green, and the run goes on to the next scenario",
  "FR-RUN-05": "With the real detectors and the real runners, a magic value that Code Green left is named by the refactoring agent",
  "FR-RUN-06": "With the real runners, the formatter and the linter fix the code, every check passes and the feature moves on to its commit",
} as const;
