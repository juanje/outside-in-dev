import { BDD_REPORT, clearReport, REAL_RUNNERS, type Runners, UNIT_REPORT } from "../../src/artifacts/verify-runner.js";
import { loadCommandTimeoutS } from "../../src/artifacts/project-config.js";
import { readJson, readText } from "../../src/artifacts/project-json.js";
import { replayCall, type ReplayKind, type ReplayRequest } from "./replay-lib.mjs";

/** Which of the runners of a project replay recorded reports (the others start the real process). */
export type Replayed = { bdd: boolean; unit: boolean; typecheck: boolean };

/** One call answered by the replay of `replay/` in the project, with the same effects as the script has in a process: the report directory made, the old report removed, the report written, the position and the log kept. There is no process, so no command timeout applies (a replay reads a few files and ends); the configured limit is still read, so a configuration the real runner refuses is refused here too. */
function replay(kind: ReplayKind, cwd: string, request: ReplayRequest, report?: string): { exitCode: number; stdout: string; stderr: string } {
  clearReport(cwd, report);
  loadCommandTimeoutS(cwd);
  return replayCall(kind, { here: cwd, cwd, request, output: report });
}

/** The runners of `oid run` that answer from the recorded reports a fixture declares, in this process, for the runners `replayed` names; the others (and the other commands) are the real ones. The semantics are those of the replay scripts: both run `replayCall`. */
export function inProcessRunners(replayed: Replayed): Runners {
  return {
    ...REAL_RUNNERS,
    ...(replayed.unit ? { unitSuite: (cwd: string) => ({ exitCode: replay("unit", cwd, "suite", UNIT_REPORT).exitCode, report: readJson(cwd, UNIT_REPORT) }) } : {}),
    ...(replayed.bdd
      ? {
          bddScenarios: (cwd: string, _command: string, scenarios: { file: string; line: number }[]) => {
            const locations = scenarios.map(({ file, line }) => `${file}:${line}`);
            const { exitCode, stderr } = replay("bdd", cwd, locations.length === 0 ? "suite" : { locations }, BDD_REPORT);
            return { exitCode, report: readText(cwd, BDD_REPORT), stderr };
          },
        }
      : {}),
    ...(replayed.typecheck ? { typecheck: (cwd: string) => { const { exitCode, stdout } = replay("typecheck", cwd, undefined); return { exitCode, output: stdout }; } } : {}),
  };
}
