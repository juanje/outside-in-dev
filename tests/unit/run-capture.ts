import { runCli } from "../../src/run-cli.js";
import { dir } from "./temp-project.js";

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs `oid` with `args` in `cwd`, in this process, and captures what it prints and its exit code. */
export async function runOid(args: string[], cwd: string): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, { cwd, stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) });
  return { exitCode, stdout, stderr };
}

/** Runs `oid` with `args` in the temporary project. */
export function runInProject(args: string[]): Promise<RunResult> {
  return runOid(args, dir);
}

/** Runs `oid` with `args` in a directory that does not exist, for commands that read nothing from the project. */
export function runWithoutProject(args: string[]): Promise<RunResult> {
  return runOid(args, "/nonexistent-oid-test-dir");
}

/** Reads the JSON document of `oid check --json`: the facts every test compares, and the messages of its violations. */
export function summariseCheckJson({ exitCode, stdout, stderr }: RunResult) {
  const report = JSON.parse(stdout) as { ok: boolean; violations: { check: string; message: string }[] };
  return {
    summary: { exitCode, stderr, ok: report.ok, checks: report.violations.map((violation) => violation.check) },
    messages: report.violations.map((violation) => violation.message),
  };
}
