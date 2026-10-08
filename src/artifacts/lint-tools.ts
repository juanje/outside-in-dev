import { isAbsolute, relative } from "node:path";
import { readJson } from "./project-json.js";

/** Which side of a tool oid runs: the one that fixes what it can, or the one that checks and reports what remains. */
export const TOOL_MODE = { fix: "fix", check: "check" } as const;
export type ToolMode = (typeof TOOL_MODE)[keyof typeof TOOL_MODE];

/** The flags oid appends for each tool it recognises by name: ESLint reports as JSON, Prettier by its exit code. */
const FLAGS = [
  { name: "eslint", tool: /\beslint\b/, fix: "--fix", check: "--format json" },
  { name: "prettier", tool: /\bprettier\b/, fix: "--write", check: "--check" },
] as const;

/** The tools oid recognises by name. */
export type ToolName = (typeof FLAGS)[number]["name"];

const NPM_SCRIPT = /^npm run (\S+)/;
const ARGUMENTS_SEPARATOR = " -- ";

/** The command of the npm script a command runs, when it runs one. */
function scriptBody(cwd: string, command: string): string | undefined {
  const name = NPM_SCRIPT.exec(command)?.[1];
  const scripts = (readJson(cwd, "package.json") as { scripts?: Record<string, string> } | undefined)?.scripts;
  return name === undefined ? undefined : scripts?.[name];
}

function flagsOf(cwd: string, command: string): (typeof FLAGS)[number] | undefined {
  return FLAGS.find(({ tool }) => tool.test(scriptBody(cwd, command) ?? command));
}

/** The tool a command runs (inside an npm script too), when oid recognises it by name. */
export function recognisedTool(cwd: string, command: string): ToolName | undefined {
  return flagsOf(cwd, command)?.name;
}

/** The command line that runs the project's formatter or linter in `mode`: the command with the flags of the tool it runs (inside an npm script too), or the command as it is when oid does not recognise the tool. */
export function toolInvocation(cwd: string, command: string, mode: ToolMode): string {
  const flags = flagsOf(cwd, command);
  if (flags === undefined) return command;
  return `${command}${NPM_SCRIPT.test(command) && !command.includes(ARGUMENTS_SEPARATOR) ? ARGUMENTS_SEPARATOR.trimEnd() : ""} ${flags[mode]}`;
}

/** An error of the project's linter or type check, located in a file. */
/** The kinds of error the gate judges. */
export const ERROR_KIND = { lint: "lint", type: "type" } as const;

export type GateError = { kind: (typeof ERROR_KIND)[keyof typeof ERROR_KIND]; file: string; line: number; code: string; message: string };

const ERROR_SEVERITY = 2;
const NO_RULE = "parse error";

type EslintFile = { filePath: string; messages: { ruleId: string | null; severity: number; message: string; line: number }[] };

/** The errors of an ESLint JSON report (`--format json`): its messages of error severity, each in the file relative to the project. */
export function lintErrors(report: string, cwd: string): GateError[] {
  return (JSON.parse(report) as EslintFile[]).flatMap(({ filePath, messages }) =>
    messages
      .filter(({ severity }) => severity === ERROR_SEVERITY)
      .map(({ ruleId, line, message }) => ({ kind: ERROR_KIND.lint, file: isAbsolute(filePath) ? relative(cwd, filePath) : filePath, line, code: ruleId ?? NO_RULE, message })),
  );
}
