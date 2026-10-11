import { GitError } from "../artifacts/git-workspace.js";
import { ProgressError } from "../artifacts/progress.js";
import { ERROR_EVENT, type OIEventBody } from "../events/types.js";

const FAILURE_EXIT_CODE = 1;

/** Runs the states of a run; when a git command in them fails, or the progress file refuses a step, the run ends with an error event holding the message and the exit code 1, and any other exception goes on to whoever holds the run. */
export async function endOnGitFailure(bus: { emit(event: OIEventBody): unknown }, run: () => Promise<number>): Promise<number> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof GitError || error instanceof ProgressError)) throw error;
    bus.emit({ type: ERROR_EVENT, message: error.message });
    return FAILURE_EXIT_CODE;
  }
}
