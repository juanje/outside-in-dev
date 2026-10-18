#!/usr/bin/env node
// Installs scripts/pre-commit as the pre-commit hook of the git repository of the current directory (AGENTS.md).
// It is a versioned script because the Claude Code hook refuses `cp` into `.git/` from Bash (ADR-055).
// The hooks directory comes from git, so a linked worktree installs into the common one.
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const source = join(import.meta.dirname, "pre-commit");
const hooks = resolve(execFileSync("git", ["rev-parse", "--git-path", "hooks"], { encoding: "utf8" }).trim());
const target = join(hooks, "pre-commit");
mkdirSync(hooks, { recursive: true });
copyFileSync(source, target);
chmodSync(target, 0o755);
console.log(`installed ${target}`);
