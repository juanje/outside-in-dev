import { CYCLE_STEP, loadProgress } from "../artifacts/progress.js";
import { NEWLINE } from "../artifacts/lines.js";
import { loadProjectConfig } from "../artifacts/project-config.js";
import { runUnitSuite } from "../artifacts/verify-runner.js";
import { normalizeVitestReport, selectTest, unitProblems, type UnitFileResult } from "../artifacts/vitest-report.js";
import { observeUnitRun } from "../commands/verify.js";
import { integrityProblems } from "../commands/verify-integrity.js";
import { PROBLEM, type RedGate, redGate } from "./bdd-red-gate.js";

/** The tests that passed before and fail now, as lines: every failing test and unloadable file but the new test and the load failure of its own file. */
function brokenTests(cwd: string, files: UnitFileResult[], test: { file: string; name: string }): string[] {
  const selection = selectTest(files, test.name);
  const others = files.map((file) => ({
    ...file,
    message: file.file.endsWith(test.file) ? "" : file.message,
    tests: selection.kind === "found" ? file.tests.filter((candidate) => candidate !== selection.test) : file.tests,
  }));
  return unitProblems(others, cwd);
}

/** Judges the unit test an agent wrote: the cheap gates first, then one run of the whole unit suite, in which every other test must still pass and the new one must fail validly, classified with the Red Gate that `oid verify red` uses. */
export function unitRedGate(worktree: string, test: { file: string; name: string }): RedGate {
  const config = loadProjectConfig(worktree);
  const early = integrityProblems(worktree, config, loadProgress(worktree, config.paths.progress), CYCLE_STEP.tddRed);
  if (early.length > 0) return { kind: PROBLEM, problem: early.join(NEWLINE) };
  const run = runUnitSuite(worktree, config.commands.unit);
  const broken = run.report === undefined ? [] : brokenTests(worktree, normalizeVitestReport(run.report), test);
  if (broken.length > 0) return { kind: PROBLEM, problem: ["unit tests that passed no longer pass:", ...broken].join(NEWLINE) };
  return redGate(worktree, config, observeUnitRun(worktree, run, test));
}
