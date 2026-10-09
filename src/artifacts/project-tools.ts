import { parseShell } from "../agents/shell-parse.js";
import { runSupervised } from "./command-supervisor.js";
import { NEWLINE } from "./lines.js";
import type { ProjectConfig } from "./project-config.js";
import { shellQuote } from "./verify-runner.js";

const MS_PER_SECOND = 1000;
/** How long the shell has to look up every tool, and to end after SIGTERM: a lookup takes milliseconds. */
const LOOKUP_SECONDS = 5;
const LOOKUP_GRACE_MS = 500;
const LOOKUP_LIMIT = { timeoutMs: LOOKUP_SECONDS * MS_PER_SECOND, graceMs: LOOKUP_GRACE_MS };
/** What ends one lookup in the shell line. */
const NEXT_LOOKUP = "; ";

/** The tools, among `tools`, that the shell cannot find from `cwd` (on the path, or as a path to an executable). Nothing is written. */
export function missingTools(cwd: string, tools: string[]): string[] {
  const lookups = tools.map((tool) => `command -v ${shellQuote(tool)} >/dev/null 2>&1 || printf '%s\\n' ${shellQuote(tool)}`);
  return runSupervised(cwd, lookups.join(NEXT_LOOKUP), LOOKUP_LIMIT).stdout.split(NEWLINE).filter((line) => line !== "");
}

/** The tools a run needs whatever the project configures. */
const ALWAYS_NEEDED = ["git"];

/** A word that sets a variable for the command after it, such as `NODE_ENV=test`. */
const ASSIGNMENT = /^[A-Za-z_]\w*=/;

/** The program each command of a command line starts: the first word of each that is not a variable assignment. A line the parser refuses gives its first word. */
function programsOf(line: string): string[] {
  const parsed = parseShell(line);
  if (!parsed.ok) return [line.trim().split(/\s+/)[0] ?? ""];
  return parsed.commands.flatMap(({ words }) => words.find(({ text }) => !ASSIGNMENT.test(text))?.text ?? []);
}

/** The programs the configured commands of the project start, each once, and the tools a run always needs. */
export function toolsOf(commands: ProjectConfig["commands"]): string[] {
  const { bdd, unit, typecheck, format, lint, coverage, extra_checks } = commands;
  const lines = [bdd, unit, typecheck, format, lint, coverage, ...extra_checks].filter((line) => line !== null);
  return [...new Set([...ALWAYS_NEEDED, ...lines.flatMap(programsOf)])].sort();
}
