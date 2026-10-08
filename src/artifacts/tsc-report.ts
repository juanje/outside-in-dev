import { isAbsolute, relative } from "node:path";
import { NEWLINE } from "./lines.js";
import { ERROR_KIND, type GateError } from "./lint-tools.js";

/** A line of `tsc --pretty false` output that locates an error: `file(line,column): error TSnnnn: message`. */
const ERROR_LINE = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/;

/** A line of the output that reports an error located in no file, such as a configuration error: `error TSnnnn: message`. */
const UNLOCATED_ERROR_LINE = /^error (TS\d+): (.*)$/;

/** Every error of the output of `tsc --pretty false`, in any file: the file relative to the project, the line, the code and the message; an error located in no file has an empty file and line 0. */
export function typeErrors(output: string, cwd: string): GateError[] {
  return output.split(NEWLINE).flatMap((line) => {
    const [, file, lineNumber, code, message] = ERROR_LINE.exec(line) ?? [];
    if (file !== undefined) return [{ kind: ERROR_KIND.type, file: isAbsolute(file) ? relative(cwd, file) : file, line: Number(lineNumber), code: code!, message: message! }];
    const [, unlocatedCode, unlocatedMessage] = UNLOCATED_ERROR_LINE.exec(line) ?? [];
    return unlocatedCode === undefined ? [] : [{ kind: ERROR_KIND.type, file: "", line: 0, code: unlocatedCode, message: unlocatedMessage! }];
  });
}

/** One line for each error of the output of `tsc --pretty false` that is located in a source file: the file relative to the project, the line, the code and the message; and each error that is located in no file. */
export function typeProblems(output: string, cwd: string, isSource: (path: string) => boolean): string[] {
  return typeErrors(output, cwd)
    .filter(({ file }) => file === "" || isSource(file))
    .map(({ file, line, code, message }) => (file === "" ? `type ${code} ${message}` : `type ${file}:${line} ${code} ${message}`));
}
