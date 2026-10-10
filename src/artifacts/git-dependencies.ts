import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { GIT, REV_PARSE } from "./git-changes.js";
import { NEWLINE } from "./lines.js";
import { ProgressError } from "./progress.js";
import { readText } from "./project-json.js";

const INSTALLS: Array<{ lockfile: string; command: string[] }> = [
  { lockfile: "package-lock.json", command: ["npm", "ci"] },
  { lockfile: "pnpm-lock.yaml", command: ["pnpm", "install", "--frozen-lockfile"] },
  { lockfile: "yarn.lock", command: ["yarn", "install", "--frozen-lockfile"] },
];

const MODULES_DIR = "node_modules";

/** Runs a command in a directory. */
export type Installer = (command: string[], cwd: string) => void;

/** Runs the command in `cwd`, discarding its output; throws when it does not succeed. */
export function runInstall(command: string[], cwd: string): void {
  const [program, ...args] = command;
  const result = spawnSync(program!, args, { cwd });
  if (result.status !== 0) throw new ProgressError(`the command ${JSON.stringify(command)} failed in ${cwd}`);
}

/** The command that installs the dependencies of the project in `dir` from its lockfile; undefined without a known lockfile. */
export function installCommand(dir: string): string[] | undefined {
  return INSTALLS.find(({ lockfile }) => existsSync(join(dir, lockfile)))?.command;
}

/** Whether every lockfile of the two directories has the same content, or is missing from both. */
function sameLockfiles(a: string, b: string): boolean {
  return INSTALLS.every(({ lockfile }) => readText(a, lockfile) === readText(b, lockfile));
}

/**
 * Adds `pattern` once to the exclude file git reads for the worktree, so the project's own `.gitignore` stays untouched.
 * A link is not a directory to git, so a project's `node_modules/` pattern does not cover it.
 */
function hideFromGit(worktree: string, pattern: string): void {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const found = spawnSync(GIT, [REV_PARSE, "--git-path", "info/exclude"], { cwd: worktree, env });
  if (found.status !== 0) return; // not a git checkout: no git to hide the link from
  const file = resolve(worktree, found.stdout.toString().trim());
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(NEWLINE) : [];
  if (lines.includes(pattern)) return;
  mkdirSync(dirname(file), { recursive: true });
  const separator = lines.length > 0 && lines[lines.length - 1] !== "" ? NEWLINE : "";
  appendFileSync(file, `${separator}${pattern}${NEWLINE}`);
}

/**
 * Gives the worktree its dependencies: a link to the main copy's `node_modules` while the lockfiles are identical,
 * otherwise an install with the package manager of its lockfile. Without a lockfile there is nothing to do.
 */
export function prepareDependencies(main: string, worktree: string, install: Installer): void {
  const command = installCommand(worktree);
  if (command === undefined) return;
  if (sameLockfiles(main, worktree) && existsSync(join(main, MODULES_DIR))) {
    symlinkSync(join(main, MODULES_DIR), join(worktree, MODULES_DIR), "dir");
    hideFromGit(worktree, `/${MODULES_DIR}`);
  } else {
    install(command, worktree);
  }
}
