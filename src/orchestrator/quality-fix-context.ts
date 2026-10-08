import { fileSection, joinSections } from "../agents/context/task-context.js";
import { NEWLINE } from "../artifacts/lines.js";
import type { GateError } from "../artifacts/lint-tools.js";

/** An error of the gate as one line of a task: its kind, location, code and message. */
export function errorLine({ kind, file, line, code, message }: GateError): string {
  return `${kind} ${file}:${line} ${code} ${message}`;
}

/** The prompt of a quality fix task: the errors with their locations and the files that have them in full; nothing else. */
export function qualityFixContext(cwd: string, errors: GateError[]): string {
  const files = [...new Set(errors.map(({ file }) => file))];
  return joinSections([["Errors to fix:", errors.map(errorLine).join(NEWLINE)], ["Files with errors:", ...files.map((file) => fileSection(cwd, file))]]);
}
