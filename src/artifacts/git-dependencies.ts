import { spawnSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
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
 * Gives the worktree its dependencies: a link to the main copy's `node_modules` while the lockfiles are identical,
 * otherwise an install with the package manager of its lockfile. Without a lockfile there is nothing to do.
 */
export function prepareDependencies(main: string, worktree: string, install: Installer): void {
  const command = installCommand(worktree);
  if (command === undefined) return;
  if (sameLockfiles(main, worktree) && existsSync(join(main, MODULES_DIR))) {
    symlinkSync(join(main, MODULES_DIR), join(worktree, MODULES_DIR), "dir");
  } else {
    install(command, worktree);
  }
}
