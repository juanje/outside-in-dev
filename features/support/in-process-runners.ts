import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { BDD_REPORT, clearReport, REAL_RUNNERS, type Runners, UNIT_REPORT } from "../../src/artifacts/verify-runner.js";
import { loadCommandTimeoutS } from "../../src/artifacts/project-config.js";
import { readJson, readText } from "../../src/artifacts/project-json.js";
import { replayCall, type ReplayKind, type ReplayRequest } from "./replay-lib.mjs";

/** Which of the runners of a project replay recorded reports (the others start the real process). */
export type Replayed = { bdd: boolean; unit: boolean; typecheck: boolean };

/** One call answered by the replay of `replay/` in `home` (the project itself unless a fixture keeps its replay files elsewhere), with the same effects as the script has in a process: the report directory made and the old report removed when the call writes a report in the project (a report at an absolute path is the caller's own: it makes nothing), the report written, the position and the log kept in the project. There is no process, so no command timeout applies (a replay reads a few files and ends); the configured limit is still read, so a configuration the real runner refuses is refused here too. */
function replay(kind: ReplayKind, cwd: string, request: ReplayRequest, report: string | undefined, home: string): { exitCode: number; stdout: string; stderr: string } {
  if (report !== undefined && !isAbsolute(report)) clearReport(cwd, report);
  loadCommandTimeoutS(cwd);
  return replayCall(kind, { here: home, cwd, request, output: report });
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

/** The text of a report file, if the call wrote it. */
function readReport(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** The runners of `oid run` and `oid try` that answer from the recorded reports a fixture declares, in this process, for the runners `replayed` names; the others (and the other commands) are the real ones. The semantics are those of the replay scripts: both run `replayCall`. */
export function inProcessRunners(replayed: Replayed, home?: string): Runners {
  const at = (cwd: string): string => home ?? cwd;
  return {
    ...REAL_RUNNERS,
    ...(replayed.unit
      ? {
          unitSuite: (cwd: string) => ({ exitCode: replay("unit", cwd, "suite", UNIT_REPORT, at(cwd)).exitCode, report: readJson(cwd, UNIT_REPORT) }),
          tryUnitTest: (cwd: string, _command: string, test: { file: string; name: string }) =>
            withTempReport("unit.json", (path) => {
              const { exitCode, stderr } = replay("unit", cwd, test, path, at(cwd));
              const text = readReport(path);
              return { exitCode, report: text === undefined ? undefined : (JSON.parse(text) as unknown), stderr };
            }),
        }
      : {}),
    ...(replayed.bdd
      ? {
          bddScenarios: (cwd: string, _command: string, scenarios: { file: string; line: number }[]) => {
            const locations = scenarios.map(({ file, line }) => `${file}:${line}`);
            const { exitCode, stderr } = replay("bdd", cwd, locations.length === 0 ? "suite" : { locations }, BDD_REPORT, at(cwd));
            return { exitCode, report: readText(cwd, BDD_REPORT), stderr };
          },
          tryBddScenario: (cwd: string, _command: string, scenario: { file: string; line: number }) =>
            withTempReport("bdd.ndjson", (path) => {
              const { exitCode, stderr } = replay("bdd", cwd, { locations: [`${scenario.file}:${scenario.line}`] }, path, at(cwd));
              return { exitCode, report: readReport(path), stderr };
            }),
        }
      : {}),
    ...(replayed.typecheck ? { typecheck: (cwd: string) => { const { exitCode, stdout } = replay("typecheck", cwd, undefined, undefined, at(cwd)); return { exitCode, output: stdout }; } } : {}),
  };
}
