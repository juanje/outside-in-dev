import { isAbsolute, relative } from "node:path";
import { NEWLINE } from "./lines.js";

/** A line of `tsc --pretty false` output that locates an error: `file(line,column): error TSnnnn: message`. */
const ERROR_LINE = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/;

/** A line of the output that reports an error located in no file, such as a configuration error: `error TSnnnn: message`. */
const UNLOCATED_ERROR_LINE = /^error (TS\d+): (.*)$/;

/** One line for each error of the output of `tsc --pretty false` that is located in a source file: the file relative to the project, the line, the code and the message; and each error that is located in no file. */
export function typeProblems(output: string, cwd: string, isSource: (path: string) => boolean): string[] {
  return output.split(NEWLINE).flatMap((line) => {
    const [, file, lineNumber, code, message] = ERROR_LINE.exec(line) ?? [];
    if (file === undefined) {
      const [, unlocatedCode, unlocatedMessage] = UNLOCATED_ERROR_LINE.exec(line) ?? [];
      return unlocatedCode === undefined ? [] : [`type ${unlocatedCode} ${unlocatedMessage}`];
    }
    const path = isAbsolute(file) ? relative(cwd, file) : file;
    return isSource(path) ? [`type ${path}:${lineNumber} ${code} ${message}`] : [];
  });
}
