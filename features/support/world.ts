import { After, Before, BeforeAll, setWorldConstructor, World } from "@cucumber/cucumber";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProblem } from "./build-freshness.js";
import { projectFiles } from "./project-files.js";
import { runCli } from "../../src/run-cli.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BUILT_CLI = join(REPO_ROOT, "dist", "cli.js");

export type Scenario = { name: string; bdd: string };
export type Feature = {
  id: string;
  title: string;
  status: string;
  cycle_step?: string;
  scenarios?: Scenario[];
};
export type Progress = { current_focus: string | null; features: Feature[] };

/** Splits a command line into arguments, honouring double quotes and backslash-escaped quotes. */
export function splitArgs(line: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === '"') {
      current += '"';
      i++;
      started = true;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
      started = true;
    } else if (ch === " " && !inQuotes) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += ch;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

export class OidWorld extends World {
  dir = "";
  stdout = "";
  stderr = "";
  exitCode: number | null = null;
  progressBefore: string | null = null;
  filesBefore = new Map<string, string>();

  path(rel: string): string {
    return join(this.dir, rel);
  }

  write(rel: string, content: string): void {
    mkdirSync(dirname(this.path(rel)), { recursive: true });
    writeFileSync(this.path(rel), content);
  }

  readProgressRaw(): string | null {
    return existsSync(this.path("progress.json")) ? readFileSync(this.path("progress.json"), "utf8") : null;
  }

  loadProgress(): Progress {
    const raw = this.readProgressRaw();
    return raw === null ? { current_focus: null, features: [] } : (JSON.parse(raw) as Progress);
  }

  saveProgress(progress: Progress): void {
    this.write("progress.json", JSON.stringify(progress, null, 2) + "\n");
  }

  /** Every file under the project directory, by relative path, with its content. */
  snapshotFiles(): Map<string, string> {
    return projectFiles(this.dir);
  }

  async run(commandLine: string): Promise<void> {
    const args = splitArgs(commandLine);
    if (args[0] === "oid") args.shift();
    this.progressBefore = this.readProgressRaw();
    this.filesBefore = this.snapshotFiles();
    let stdout = "";
    let stderr = "";
    this.exitCode = await runCli(args, {
      cwd: this.dir,
      stdout: (text) => (stdout += text),
      stderr: (text) => (stderr += text),
    });
    this.stdout = stdout;
    this.stderr = stderr;
  }

  /** Runs `git` with `args` in the project directory (never in the repository oid is developed in) and fails the step when git fails. */
  git(...args: string[]): void {
    const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
    const result = spawnSync("git", args, { cwd: this.dir, env, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }

  /** Runs the command with piped output, reads the first chunk of stdout, then destroys the stream. */
  async runClosingOutputEarly(commandLine: string): Promise<void> {
    const args = splitArgs(commandLine);
    if (args[0] === "oid") args.shift();
    const child = spawn(process.execPath, [BUILT_CLI, ...args], {
      cwd: this.dir,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    const exited = new Promise<number | null>((done) => child.on("close", (code) => done(code)));
    await new Promise<void>((done) => child.stdout.once("data", () => done()));
    child.stdout.destroy();
    this.exitCode = await exited;
    this.stdout = "";
    this.stderr = stderr;
  }
}

setWorldConstructor(OidWorld);

// oid spawns `git`, `jscpd` and `knip` with the inherited environment. Under a git hook, GIT_* variables
// would point oid's git at the real repository instead of the scenario's directory; and `--import tsx` in
// NODE_OPTIONS (set to load these steps) would be resolved relative to the scenario's directory and fail.
BeforeAll(function () {
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "NODE_OPTIONS"]) delete process.env[name];
});

Before(function (this: OidWorld) {
  this.dir = mkdtempSync(join(tmpdir(), "oid-bdd-"));
});

// A scenario that needs a real process runs the build: refuse to test a missing or stale one.
Before({ tags: "@process" }, function () {
  const problem = buildProblem(REPO_ROOT);
  if (problem !== null) throw new Error(problem);
});

After(function (this: OidWorld) {
  rmSync(this.dir, { recursive: true, force: true });
});
