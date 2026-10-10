import type { CliIo } from "../cli-io.js";
import { resumeRun } from "../orchestrator/resume.js";
import type { RunServices } from "../orchestrator/services.js";

/** `oid resume`: resumes the run the session saved, at the state it stopped in, and returns the exit code of the process. */
export function runResume(io: CliIo, services: RunServices): Promise<number> {
  return resumeRun(io.cwd, { write: io.stdout }, services);
}
