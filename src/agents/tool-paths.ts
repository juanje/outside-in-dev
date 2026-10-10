import { z } from "zod";
import { names } from "./names.js";

const PATH_ARG = ["path"] as const;
const NO_PATHS = [] as const;

/** Which arguments of each tool hold a path. A tool missing from this table is unknown to the sandbox and its calls are blocked. */
export const TOOL_PATH_ARGS: Readonly<Record<string, readonly string[]>> = {
  read: PATH_ARG,
  write: PATH_ARG,
  edit: PATH_ARG,
  grep: PATH_ARG,
  find: PATH_ARG,
  ls: PATH_ARG,
  bash: NO_PATHS,
  report: NO_PATHS,
  request_dependency: NO_PATHS,
  try: NO_PATHS,
};

/** The searches that mean the worktree root when they carry no path. */
const SEARCHES = new Set(names("grep find ls"));
const WORKTREE_ROOT = ".";
const PATH_SHAPED = /^(path|paths|file|files|filepath|filename|dir|directory|cwd|root|source|src|destination|dest|target|from|to)$/i;

/** Whether a parameter name looks like it holds a path, so that a tool with one that the table does not declare is a defect. */
export function isPathShaped(name: string): boolean {
  return PATH_SHAPED.test(name);
}

const text = z.string();

export function isText(value: unknown): value is string {
  return text.safeParse(value).success;
}

/** The paths a call touches; the worktree root for a search without a path; `undefined` for an unknown tool or an argument that is not a path, which the sandbox blocks. */
export function pathsOf(tool: string, args: unknown): string[] | undefined {
  const names = TOOL_PATH_ARGS[tool];
  if (names === undefined) return undefined;
  const given = args as Record<string, unknown>;
  const paths: string[] = [];
  for (const name of names) {
    const value = given[name];
    if (value === undefined && SEARCHES.has(tool)) paths.push(WORKTREE_ROOT);
    else if (isText(value)) paths.push(value);
    else return undefined;
  }
  return paths;
}
