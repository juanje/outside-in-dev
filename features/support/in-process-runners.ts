import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { BDD_REPORT, clearReport, CommandTimeoutError, REAL_RUNNERS, type Runners, UNIT_REPORT } from "../../src/artifacts/verify-runner.js";
import { loadCommandTimeoutS } from "../../src/artifacts/project-config.js";
import { readJson, readText } from "../../src/artifacts/project-json.js";
import { replayCall, type ReplayKind, type ReplayRequest } from "./replay-lib.mjs";

/** Which of the runners of a project replay recorded reports (the others start the real process). */
export type Replayed = { bdd: boolean; unit: boolean; typecheck: boolean };

/** One call answered by the replay of `replay/` in `home` (the project itself unless a fixture keeps its replay files elsewhere), with the same effects as the script has in a process: the report directory made and the old report removed when the call writes a report in the project (a report at an absolute path is the caller's own: it makes nothing), the report written, the position and the log kept in the project. There is no process, so no command timeout applies (a replay reads a few files and ends); the configured limit is still read, so a configuration the real runner refuses is refused here too. */
function replay(kind: ReplayKind, command: string, cwd: string, request: ReplayRequest, report: string | undefined, home: string): { exitCode: number; stdout: string; stderr: string } {
  if (report !== undefined && !isAbsolute(report)) clearReport(cwd, report);
  const seconds = loadCommandTimeoutS(cwd);
  const answered = replayCall(kind, { here: home, cwd, request, output: report });
  // An entry that stands for a command that does not end is answered as the supervisor of a real command does: no waiting, the same error.
  if (answered.hung === true) throw new CommandTimeoutError(command, seconds);
  return answered;
}

/** Runs `use` with the path of a report file in a directory of its own, which is removed afterwards: what `oid try` does, so that it writes nothing in the project. */
function withTempReport<T>(name: string, use: (path: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "oid-try-replay-"));
  try {
    return use(join(directory, name));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Where the state of the run at each BDD call is kept: one line per call of the log of the replay, in the same order. */
export const STATE_LOG = join(".outside-in", "replay-states.ndjson");

/** Keeps, for the BDD call just answered or refused, the state the run was in when it asked (the log of the replay has no state, and it has no order shared with the event log). */
function recordState(cwd: string, state: string | undefined): void {
  mkdirSync(join(cwd, ".outside-in"), { recursive: true });
  appendFileSync(join(cwd, STATE_LOG), `${JSON.stringify({ state: state ?? null })}\n`);
}

/** The text of a report file, if the call wrote it. */
function readReport(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** The runners of `oid run` and `oid try` that answer from the recorded reports a fixture declares, in this process, for the runners `replayed` names; the others (and the other commands) are the real ones. The semantics are those of the replay scripts: both run `replayCall`. */
export function inProcessRunners(replayed: Replayed, home?: string, stateOf?: () => string | undefined): Runners {
  const at = (cwd: string): string => home ?? cwd;
  return {
    ...REAL_RUNNERS,
    ...(replayed.unit
      ? {
          unitSuite: (cwd: string, command: string) => ({ exitCode: replay("unit", command, cwd, "suite", UNIT_REPORT, at(cwd)).exitCode, report: readJson(cwd, UNIT_REPORT) }),
          tryUnitTest: (cwd: string, command: string, test: { file: string; name: string }) =>
            withTempReport("unit.json", (path) => {
              const { exitCode, stderr } = replay("unit", command, cwd, test, path, at(cwd));
              const text = readReport(path);
              return { exitCode, report: text === undefined ? undefined : (JSON.parse(text) as unknown), stderr };
            }),
        }
      : {}),
    ...(replayed.bdd
      ? {
          bddScenarios: (cwd: string, command: string, scenarios: { file: string; line: number }[]) => {
            const locations = scenarios.map(({ file, line }) => `${file}:${line}`);
            const { exitCode, stderr } = replay("bdd", command, cwd, locations.length === 0 ? "suite" : { locations }, BDD_REPORT, at(cwd));
            recordState(cwd, stateOf?.());
            return { exitCode, report: readText(cwd, BDD_REPORT), stderr };
          },
          tryBddScenario: (cwd: string, command: string, scenario: { file: string; line: number }) =>
            withTempReport("bdd.ndjson", (path) => {
              const { exitCode, stderr } = replay("bdd", command, cwd, { locations: [`${scenario.file}:${scenario.line}`] }, path, at(cwd));
              return { exitCode, report: readReport(path), stderr };
            }),
        }
      : {}),
    ...(replayed.typecheck ? { typecheck: (cwd: string, command: string) => { const { exitCode, stdout } = replay("typecheck", command, cwd, undefined, undefined, at(cwd)); return { exitCode, output: stdout }; } } : {}),
  };
}
