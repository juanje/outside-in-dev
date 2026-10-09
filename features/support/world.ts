import { After, Before, BeforeAll, Status, setDefaultTimeout, setWorldConstructor, World } from "@cucumber/cucumber";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProblem } from "./build-freshness.js";
import { projectFiles } from "./project-files.js";
import { replayCallsText } from "./replay-log.js";
import type { FindingDraft } from "../../src/artifacts/findings.js";
import { runCli } from "../../src/run-cli.js";
import type { PiSdk } from "../../src/agents/runner.js";
import type { Runners } from "../../src/artifacts/verify-runner.js";
import type { CliIo } from "../../src/cli-io.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BUILT_CLI = join(REPO_ROOT, "dist", "cli.js");

/** The terminal an in-process run is given: none, or one that answers the review. */
export type TerminalInput = { isTTY: false } | { isTTY: true; choose(prompt: string, actions: string[]): Promise<string>; line(prompt: string): Promise<string>; secret?(prompt: string): Promise<string> };
/** What an in-process `oid run` or `oid setup` is given in place of the real agent, the real terminal, the standard input and the Pi directory. */
export type RunServices = { sdk?: PiSdk; input?: TerminalInput; pid: number; agentDir: string; configDir?: string; piAgentDir?: string; readStdin?: () => Promise<string>; detect?: (worktree: string) => FindingDraft[]; runners?: Runners; preflight?: { configDir: string; agentDir: string; sdk?: PiSdk }; signal?: (pid: number) => void; aborted?: () => boolean };

/** `runCli` as the scenarios call it: with the services of the run. */
const runWithServices: (args: string[], io: CliIo, services?: RunServices) => Promise<number> = runCli;

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
  /** The directory the built CLI runs in when it is not `dir` itself (a project inside it, with its worktrees beside it). */
  projectDir = "";
  /** Whether `run` starts the built CLI in a child process instead of calling it in this one. */
  built = false;
  /** What an in-process `oid run` is given in place of the real agent and the real terminal. */
  services: RunServices | undefined;
  stdout = "";
  stderr = "";
  exitCode: number | null = null;
  progressBefore: string | null = null;
  filesBefore = new Map<string, string>();
  /** The processes `oid abort` signalled, in order. In this process a signal does not stop anything: it raises `abortRequested`. */
  signalled: number[] = [];
  /** Whether a signal reached the run in this process since it started; each run starts without one. */
  abortRequested = false;

  /** The services of a run in this process that record a signal as `oid abort` sends it and let the run see it: a signal to any process is taken as one to the run. */
  signalServices(): Pick<RunServices, "signal" | "aborted"> {
    return {
      signal: (pid) => {
        this.signalled.push(pid);
        this.abortRequested = true;
      },
      aborted: () => this.abortRequested,
    };
  }

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
    if (this.built) {
      this.runBuilt(commandLine);
      return;
    }
    const args = splitArgs(commandLine);
    if (args[0] === "oid") args.shift();
    this.progressBefore = this.readProgressRaw();
    this.filesBefore = this.snapshotFiles();
    this.abortRequested = false;
    let stdout = "";
    let stderr = "";
    this.exitCode = await runWithServices(
      args,
      {
        cwd: this.projectDir || this.dir,
        stdout: (text) => (stdout += text),
        stderr: (text) => (stderr += text),
      },
      this.services,
    );
    this.stdout = stdout;
    this.stderr = stderr;
  }

  /** The scratch directories a built CLI run uses, removed after the scenario. */
  scratch: string[] = [];

  /** What the built CLI sees of the user's setup: a scratch configuration directory with models and a dummy key (never the user's real one), and a scratch directory on the path with the executable `t`, the type check command of the fixtures. */
  builtEnvironment(): Record<string, string> {
    const root = mkdtempSync(join(tmpdir(), "oid-bdd-user-"));
    this.scratch.push(root);
    const config = join(root, "config");
    mkdirSync(join(config, "agent"), { recursive: true });
    writeFileSync(join(config, "config.json"), JSON.stringify({ models: { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5" } }));
    writeFileSync(join(config, "agent", "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "sk-scratch-not-a-key" } }), { mode: 0o600 });
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "t"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    return { OID_CONFIG_DIR: config, OID_AGENT_DIR: join(config, "agent"), PATH: `${bin}:${process.env.PATH ?? ""}` };
  }

  /** Runs the command with the built CLI (`dist/cli.js`) in a child process, as a user would, and keeps what it printed and its exit code. */
  runBuilt(commandLine: string): void {
    const args = splitArgs(commandLine);
    if (args[0] === "oid") args.shift();
    this.progressBefore = this.readProgressRaw();
    this.filesBefore = this.snapshotFiles();
    const result = spawnSync(process.execPath, [BUILT_CLI, ...args], { cwd: this.projectDir || this.dir, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", ...this.builtEnvironment() }, timeout: CHILD_TIMEOUT_MS, killSignal: "SIGKILL" });
    if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      throw new Error(`"${commandLine}" did not end within ${CHILD_TIMEOUT_MS / 1000} s and was killed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    if (result.error !== undefined) throw new Error(`"${commandLine}" could not run: ${result.error.message}`);
    this.exitCode = result.status;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
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
    try {
      await new Promise<void>((done) => {
        child.stdout.once("data", () => done());
        child.once("close", () => done());
        child.once("error", () => done());
      });
      child.stdout.destroy();
      this.exitCode = await Promise.race([exited, new Promise<never>((_, fail) => setTimeout(() => fail(new Error(`"${commandLine}" did not end within ${CHILD_TIMEOUT_MS / 1000} s after its output was closed.\nstderr:\n${stderr}`)), CHILD_TIMEOUT_MS).unref())]);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
    this.stdout = "";
    this.stderr = stderr;
  }
}

setWorldConstructor(OidWorld);

/** The scenarios of `oid run` that use the real runners take longer than the 5 seconds a step has by default. */
const STEP_TIMEOUT_MS = 60_000;
/** A child process of the harness is stopped below the step limit, so the failure names the command and not just "timed out". */
const CHILD_TIMEOUT_MS = 50_000;
setDefaultTimeout(STEP_TIMEOUT_MS);

// oid spawns `git`, `jscpd` and `knip` with the inherited environment. Under a git hook, GIT_* variables
// would point oid's git at the real repository instead of the scenario's directory; and `--import tsx` in
// NODE_OPTIONS (set to load these steps) would be resolved relative to the scenario's directory and fail.
BeforeAll(function () {
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "NODE_OPTIONS"]) delete process.env[name];
  // No git configuration of the machine (user, default branch, signing, hooks path) reaches a scenario.
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

Before(function (this: OidWorld) {
  this.dir = mkdtempSync(join(tmpdir(), "oid-bdd-"));
});

// A scenario that needs a real process runs the build: refuse to test a missing or stale one.
Before({ tags: "@process" }, function () {
  const problem = buildProblem(REPO_ROOT);
  if (problem !== null) throw new Error(problem);
});

// A failed scenario keeps the calls its replay runners answered or refused, before its directory is removed.
After(function (this: OidWorld, { result }) {
  const calls = result?.status === Status.FAILED ? replayCallsText(this.dir) : "";
  if (calls !== "") this.attach(calls, "text/plain");
  rmSync(this.dir, { recursive: true, force: true });
  for (const directory of this.scratch) rmSync(directory, { recursive: true, force: true });
});
