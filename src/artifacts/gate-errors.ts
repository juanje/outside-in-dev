import { NEWLINE } from "./lines.js";
import type { GateError } from "./lint-tools.js";
import { readText } from "./project-json.js";

const WHITESPACE = /\s+/g;
const ONE_SPACE = " ";
const KEY_SEPARATOR = "\t";

/** The text of a line of a file of the project with its whitespace collapsed; empty when the file or the line is not there. */
function lineText(cwd: string, file: string, line: number): string {
  return (readText(cwd, file)?.split(NEWLINE)[line - 1] ?? "").replace(WHITESPACE, ONE_SPACE).trim();
}

/** The identity of an error across runs: its file, its code and the text of its line, never the line number, so an error whose line moved is the same error. */
export function errorKey(cwd: string, { file, line, code }: GateError): string {
  return [file, code, lineText(cwd, file, line)].join(KEY_SEPARATOR);
}

/** The errors whose identity the baseline does not hold: what the run introduced. */
export function newErrors(cwd: string, errors: GateError[], held: Set<string>): GateError[] {
  return errors.filter((error) => !held.has(errorKey(cwd, error)));
}
