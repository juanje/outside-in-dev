import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import type { Finding } from "../artifacts/findings.js";
import { isObject, ProgressError } from "../artifacts/progress.js";
import { readJson } from "../artifacts/project-json.js";
import type { InputRequest } from "../events/types.js";
import type { RunSpend, Spend } from "./budget.js";
import type { GateBaseline } from "./gate-checks.js";

/** The directory of oid's local state, relative to the project. */
export const OUTSIDE_IN_DIR = ".outside-in";
const JSON_INDENT = 2;
const SESSION_FILE = `${OUTSIDE_IN_DIR}/session.json`;

/** The directory of a run's logs and records. */
export function runDirectory(cwd: string, runId: string): string {
  return join(cwd, OUTSIDE_IN_DIR, "runs", runId);
}

/** What a started run saves to be resumed: where it works and the state it reached. */
export type RunSession = { runId: string; worktree: string; branch: string; baseCommit: string; state: string; targetFrs?: string[]; featureHashes?: Record<string, string>; fr?: string; scenario?: { index: number; name: string; location: string }; scenarioUnitTests?: Record<string, string[]>; innerIteration?: number; pendingFindings?: string[]; spend?: RunSpend; extensions?: number };

function writeSession(cwd: string, session: object): void {
  mkdirSync(join(cwd, OUTSIDE_IN_DIR), { recursive: true });
  writeFileAtomic(join(cwd, SESSION_FILE), `${JSON.stringify(session)}\n`);
}

/** Saves the session of a new run, replacing whatever an earlier run saved. */
export function startSession(cwd: string, session: RunSession): void {
  writeSession(cwd, session);
}

/** Changes some fields of the saved session of the run, keeping the rest. */
export function updateSession(cwd: string, changes: Partial<RunSession>): void {
  writeSession(cwd, { ...(readJson(cwd, SESSION_FILE) as object), ...changes });
}

/** Saves the session of the run with the request that waits for an answer, keeping what an earlier session of the same run held. */
export function savePendingInput(cwd: string, runId: string, request: InputRequest): void {
  const saved = readJson(cwd, SESSION_FILE);
  if (saved !== undefined && !isObject(saved)) throw new ProgressError(`${SESSION_FILE} is not an object`);
  const sameRun = saved !== undefined && "runId" in saved && saved.runId === runId;
  writeSession(cwd, { ...(sameRun ? saved : {}), runId, pendingInput: request });
}

/** What the saved session records the run has spent: nothing, until a call is recorded. */
export function spendOf(cwd: string): RunSpend {
  return (readJson(cwd, SESSION_FILE) as RunSession).spend ?? { usd: 0, tokens: 0, byFr: {} };
}

/** Adds what a billable call cost (an agent session now, a Jev call later) to the spend of the run and of the feature in the saved session. */
export function recordSpend(cwd: string, fr: string, cost: Spend): void {
  const spend = spendOf(cwd);
  const before = spend.byFr[fr] ?? { usd: 0, tokens: 0 };
  updateSession(cwd, { spend: { usd: spend.usd + cost.usd, tokens: spend.tokens + cost.tokens, byFr: { ...spend.byFr, [fr]: { usd: before.usd + cost.usd, tokens: before.tokens + cost.tokens } } } });
}

/** How many times the person extended the cost limit in this run. */
export function extensionsOf(cwd: string): number {
  return (readJson(cwd, SESSION_FILE) as RunSession).extensions ?? 0;
}

/** Records that the person extended the cost limit: it counts once more. */
export function extendCostLimit(cwd: string): void {
  updateSession(cwd, { extensions: extensionsOf(cwd) + 1 });
}

/** The unit tests the saved session records for a scenario, in the order they were written. */
export function unitTestsOf(cwd: string, scenario: string): string[] {
  const saved = readJson(cwd, SESSION_FILE) as RunSession;
  return saved.scenarioUnitTests?.[scenario] ?? [];
}

/** Records a unit test of a scenario in the saved session. */
export function recordUnitTest(cwd: string, scenario: string, test: string): void {
  const saved = readJson(cwd, SESSION_FILE) as RunSession;
  updateSession(cwd, { scenarioUnitTests: { ...saved.scenarioUnitTests, [scenario]: [...unitTestsOf(cwd, scenario), test] } });
}

/** Keeps the findings of a rejected refactor in the next numbered file of the run and lists the file in the saved session. */
export function keepPendingFindings(cwd: string, runId: string, findings: Finding[]): void {
  const kept = (readJson(cwd, SESSION_FILE) as RunSession).pendingFindings ?? [];
  const path = `${OUTSIDE_IN_DIR}/runs/${runId}/findings/${kept.length + 1}.json`;
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileAtomic(join(cwd, path), `${JSON.stringify(findings, null, JSON_INDENT)}\n`);
  updateSession(cwd, { pendingFindings: [...kept, path] });
}

/** The identity of the findings the detectors reported when the run started, from the baseline of the run. */
export function runBaselineFindings(cwd: string, runId: string): string[] {
  return ((readJson(cwd, `${OUTSIDE_IN_DIR}/runs/${runId}/baseline.json`) as { findings?: string[] }).findings) ?? [];
}

/** What the baseline of the run holds for the quality gate: the lint errors, type errors and traceability violations the project had when the run started. */
export function runGateBaseline(cwd: string, runId: string): GateBaseline {
  const recorded = readJson(cwd, `${OUTSIDE_IN_DIR}/runs/${runId}/baseline.json`) as Partial<GateBaseline>;
  return { lint: recorded.lint ?? [], types: recorded.types ?? [], traceability: recorded.traceability ?? [] };
}
