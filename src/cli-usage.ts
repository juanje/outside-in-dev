import { ProgressError } from "./artifacts/progress.js";

/** The error for a command or subcommand that is missing or not one of `valid`. */
export function commandError(kind: "command" | "subcommand", given: string | undefined, valid: string[]): ProgressError {
  const problem = given === undefined ? `missing ${kind}` : `unknown ${kind} ${given}`;
  return new ProgressError(`${problem}; valid ${kind}s: ${valid.join(", ")}`);
}

/** Width of the name column in help listings: wide enough for the longest name and two spaces. */
const NAME_WIDTH = 20;

/** One help line: an indented name, padded, then its description. */
export function row(name: string, text: string): string {
  return `  ${name.padEnd(NAME_WIDTH)}${text}\n`;
}

/** The flag that asks a command for its help text. */
export const HELP_FLAG = "--help";
