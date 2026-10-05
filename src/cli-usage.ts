import { ProgressError } from "./artifacts/progress.js";

/** The error for a command or subcommand that is missing or not one of `valid`. */
export function commandError(kind: "command" | "subcommand", given: string | undefined, valid: string[]): ProgressError {
  const problem = given === undefined ? `missing ${kind}` : `unknown ${kind} ${given}`;
  return new ProgressError(`${problem}; valid ${kind}s: ${valid.join(", ")}`);
}
