/** Ends the run from deep inside a state, with the exit code of the process: thrown where a person's answer, or an abort, stops the run, and caught where the run is held. */
export class RunStopped extends Error {
  constructor(readonly code: number) {
    super(`the run stopped with the exit code ${code}`);
  }
}
