import { type Rejection, rejection } from "../artifacts/rejection.js";
import { CommandTimeoutError } from "../artifacts/verify-runner.js";

/** What the next attempt does when a command of a check did not end: the cause is in the code or the tests it runs. */
const TIMEOUT_NEXT = "fix what keeps the command from ending (a test or code that never ends, a watch mode), then try again";

/** Runs `judge`; a command that passed `limits.command_timeout_s` is answered by `answer`, any other error goes on. */
export function whenTimedOut<T, U>(judge: () => T, answer: (error: CommandTimeoutError) => U): T | U {
  try {
    return judge();
  } catch (error) {
    if (!(error instanceof CommandTimeoutError)) throw error;
    return answer(error);
  }
}

/** The rejection of an attempt whose check ran a command that passed its limit: the command and the limit are the evidence. */
function timeoutRejection(error: CommandTimeoutError): Rejection {
  return rejection({ failed: "a command did not end within its limit", evidence: error.message, next: TIMEOUT_NEXT });
}

/** Runs the gate `judge`; a command that passed its limit rejects the attempt, with the command and the limit as evidence. */
export function rejectingTimeout<T>(judge: () => T): T | Rejection {
  return whenTimedOut(judge, timeoutRejection);
}
