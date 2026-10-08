import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CART_CODE, CART_FILE, TEST_FILE, UNIT_TESTS } from "../support/cart-files.js";
import { detectorOf } from "../support/fake-detector.js";
import type { FindingDraft } from "../../src/artifacts/findings.js";
import type { Round } from "../support/fake-agent.js";
import { git } from "../support/run-project.js";
import type { OidWorld } from "../support/world.js";
import { agentOf, worktreePath, worktreeText } from "./run-features.steps.js";
import { assertShellTool, codeRound, expect, filesOfCommit, findCommit, planOf } from "./run-loop.steps.js";
import { eventLog, PROJECT, session } from "./run.steps.js";

const BLOCKED_PATTERN = /^reports that it is blocked with the reason "(.+)"$/;
/** The lines of `src/cart.ts` that the coding agent writes: its `addLine` function and its `countCartLines` function. */
const ADD_LINE_LINES = { start: 2, end: 4 };
const COUNT_LINES = { start: 6, end: 9 };

const magicValue = (file: string, range = ADD_LINE_LINES): FindingDraft => ({ category: "magic_value", file, range, detail: "the number 100" });
const staleDocumentation = (): FindingDraft => ({ category: "doc_drift", file: "src/cart.ts", range: COUNT_LINES, symbol: "countCartLines", detail: "@param lines does not match the signature" });
const unusedExport = (): FindingDraft => ({ category: "dead_code", file: "src/cart.ts", range: COUNT_LINES, symbol: "countCartLines", detail: "unused export" });

/** What the fake runners replay for the run of the refactoring agent's change: the unit report, the scenario runs, and whether the type check fails. */
type Acceptance = { unit?: string; bdd: string[]; typecheck?: string };

/** The recorded scenario run that keeps the status the last one of the plan has. */
function sameStatus(world: OidWorld): string {
  const { bdd } = planOf(world);
  return bdd[bdd.length - 1]!;
}

/** Adds to the plan what the run replays once the refactoring agent has worked: the run of the scenarios before it, and the runs after it. */
function acceptanceReplay(world: OidWorld, { unit, bdd, typecheck }: Acceptance): void {
  const plan = planOf(world);
  plan.typecheck = typecheck === undefined ? plan.typecheck : [null, typecheck];
  expect(world, { unit: unit === undefined ? [] : [unit], bdd });
}

Given("the detectors find nothing", function (this: OidWorld) {
  detectorOf(this).afterGreen = [];
});

Given("the detectors find a magic value in {string}", function (this: OidWorld, file: string) {
  detectorOf(this).afterGreen.push(magicValue(file));
});

Given("the detectors also find a stale documentation comment in {string}", function (this: OidWorld, file: string) {
  assert.equal(file, "src/cart.ts");
  detectorOf(this).afterGreen.push(staleDocumentation());
});

Given("the detectors also find a magic value in {string}, which the Green did not change", function (this: OidWorld, file: string) {
  detectorOf(this).afterGreen.push(magicValue(file, { start: 1, end: 1 }));
});

Given("the detectors also find a stale documentation comment in {string}, which was already there when the run started", function (this: OidWorld, file: string) {
  assert.equal(file, "src/cart.ts");
  detectorOf(this).atStart.push(staleDocumentation());
  detectorOf(this).afterGreen.push(staleDocumentation());
});

Given("the refactoring agent writes the cart code without the magic value, and the detectors find nothing afterwards", function (this: OidWorld) {
  agentOf(this).refactorRoute.rounds.push(codeRound(CART_CODE.refactored));
  const same = sameStatus(this);
  acceptanceReplay(this, { unit: "unit-green", bdd: [same, same] });
});

Given("the refactoring agent also tries to write {string} and {string}", function (this: OidWorld, first: string, second: string) {
  agentOf(this).refactorRoute.attempts = [first, second];
});

/** The ways a refactoring attempt goes wrong: what the agent writes, what the detectors find afterwards, and what the runs replay. */
const REFACTOR_PROBLEMS: Record<string, { round: Round; afterwards?: FindingDraft[]; acceptance: (same: string) => Acceptance }> = {
  "its code has a type error": { round: codeRound(CART_CODE.withTypeError), acceptance: (same) => ({ unit: "unit-green", typecheck: "typecheck-error", bdd: [same] }) },
  "its code makes a unit test fail": { round: codeRound(CART_CODE.unitFailing), acceptance: (same) => ({ unit: "unit-still-failing", bdd: [same] }) },
  'its code breaks the scenario "Add to cart"': { round: codeRound(CART_CODE.refactored), acceptance: (same) => ({ unit: "unit-green", bdd: ["regression", same] }) },
  "its code leaves the finding where it was": { round: codeRound(CART_CODE.refactored), afterwards: [magicValue("src/cart.ts")], acceptance: (same) => ({ unit: "unit-green", bdd: [same] }) },
  "its code brings a new finding": { round: codeRound(CART_CODE.refactored), afterwards: [unusedExport()], acceptance: (same) => ({ unit: "unit-green", bdd: [same] }) },
  "its code is more complex than before": { round: codeRound(CART_CODE.moreComplex), acceptance: (same) => ({ unit: "unit-green", bdd: [same] }) },
  "it changes the unit test": { round: { ...codeRound(CART_CODE.refactored), bypass: [{ path: TEST_FILE, content: `${UNIT_TESTS["adds a line"]}// changed\n` }] }, acceptance: (same) => ({ bdd: [same] }) },
};

Given(/^the refactoring agent's attempt goes wrong because (.+)$/, function (this: OidWorld, problem: string) {
  const found = REFACTOR_PROBLEMS[problem];
  assert.ok(found !== undefined, `unknown problem: ${problem}`);
  agentOf(this).refactorRoute.rounds.push(found.round);
  if (found.afterwards !== undefined) detectorOf(this).afterRefactor.push(found.afterwards);
  acceptanceReplay(this, found.acceptance(sameStatus(this)));
});

Given(/^the refactoring agent (reports that it is blocked with the reason ".+"|cannot reach its provider)$/, function (this: OidWorld, problem: string) {
  const { refactorRoute } = agentOf(this);
  const reason = BLOCKED_PATTERN.exec(problem)?.[1];
  if (reason === undefined) refactorRoute.providerError = "the provider rejected the api key";
  else refactorRoute.blocked = { reason: "spec_gap", detail: reason };
  acceptanceReplay(this, { bdd: [sameStatus(this)] });
});

Given("the coding agent writes cart code with a magic number that passes the unit test and the scenario", function (this: OidWorld) {
  agentOf(this).codeRoute.rounds.push(codeRound(CART_CODE.withMagicNumber));
  expect(this, { unit: ["unit-green"], bdd: ["bdd-add-line-green"] });
  const { detect: _fake, ...real } = this.services!;
  this.services = real;
});

Given("the refactoring agent replaces the magic number with a named constant", function (this: OidWorld) {
  agentOf(this).refactorRoute.rounds.push(codeRound(CART_CODE.refactored));
});

Then("the detectors ran once, after Code Green", function (this: OidWorld) {
  const { calls } = detectorOf(this);
  assert.equal(calls.length, 2, "one call for the baseline of the start and one after Code Green");
  assert.ok(calls.every((call) => call === worktreePath(this)), calls.join(", "));
});

Then("the refactoring agent was never started", function (this: OidWorld) {
  assert.deepEqual(agentOf(this).refactorRoute.tasks, []);
});

Then("the worktree has the commit {string} with the refactored cart code", function (this: OidWorld, message: string) {
  assert.ok(filesOfCommit(this, message).includes(CART_FILE));
  assert.equal(git(worktreePath(this), "show", `${findCommit(this, message)}:${CART_FILE}`), CART_CODE.refactored.trimEnd());
});

Then("the saved session lists no pending findings", function (this: OidWorld) {
  assert.deepEqual((session(this) as { pendingFindings?: string[] }).pendingFindings ?? [], []);
});

function firstRefactorTask(world: OidWorld): string {
  const [task] = agentOf(world).refactorRoute.tasks;
  assert.ok(task, "the refactoring agent was not run");
  return task;
}

Then('the first task of the refactoring agent lists the magic value and the stale documentation comment of {string}, each with its lines and the code of those lines', function (this: OidWorld, file: string) {
  const task = firstRefactorTask(this);
  assert.equal(file, "src/cart.ts");
  for (const text of ["magic_value src/cart.ts:2-4", "return [...lines, line];", "doc_drift src/cart.ts:6-9 [countCartLines]", "return lines.length;"]) assert.ok(task.includes(text), `no ${text}`);
});

Then("the first task of the refactoring agent includes the signature of {string} with its description", function (this: OidWorld, name: string) {
  const task = firstRefactorTask(this);
  assert.ok(task.includes(`${name}(lines: string[]): number`), "no signature");
  assert.ok(task.includes("Counts the lines of a cart."), "no description");
});

Then("the first task of the refactoring agent includes no unit test", function (this: OidWorld) {
  const task = firstRefactorTask(this);
  assert.ok(task.includes("magic_value"), "the task is empty");
  for (const marker of ["cart lines", "cart-test-marker", "expect("]) assert.ok(!task.includes(marker), `the task includes ${marker}`);
});

Then("the refactoring agent was refused both writes", function (this: OidWorld) {
  const { refused, attempts } = agentOf(this).refactorRoute;
  assert.deepEqual(refused, attempts);
  assert.equal(attempts.length, 2);
});

Then("the refactoring agent had a shell tool", function (this: OidWorld) {
  assertShellTool(agentOf(this).refactorRoute);
});

Then("the first task of the refactoring agent lists the magic value of {string}", function (this: OidWorld, file: string) {
  assert.ok(firstRefactorTask(this).includes(`magic_value ${file}:2-4`));
});

Then("the first task of the refactoring agent lists a magic value of {string}", function (this: OidWorld, file: string) {
  assert.ok(firstRefactorTask(this).includes(`magic_value ${file}:`));
});

Then("the first task of the refactoring agent does not list the magic value of {string} or the stale documentation comment", function (this: OidWorld, file: string) {
  const task = firstRefactorTask(this);
  assert.ok(task.includes("magic_value src/cart.ts"), "the task is empty");
  assert.ok(!task.includes(`magic_value ${file}`) && !task.includes("doc_drift"), task);
});

Then("the refactor raised no error", function (this: OidWorld) {
  const log = eventLog(this);
  const reached = log.findIndex((event) => event.type === "state_change" && event.from === "REFACTOR" && event.to === "BDD_CHECK");
  assert.ok(reached >= 0, "the run never left REFACTOR for BDD_CHECK");
  assert.deepEqual(log.slice(0, reached).filter((event) => event.type === "error"), []);
});

Then("the cart code of the worktree is as the coding agent wrote it", function (this: OidWorld) {
  assert.equal(worktreeText(this, CART_FILE), CART_CODE.withCount);
});

Then("the saved session lists one pending finding, the magic value of {string}", function (this: OidWorld, file: string) {
  const { pendingFindings } = session(this) as { pendingFindings?: string[] };
  assert.equal(pendingFindings?.length, 1, JSON.stringify(pendingFindings));
  const kept = JSON.parse(readFileSync(this.path(join(PROJECT, pendingFindings![0]!)), "utf8")) as { category: string; file: string }[];
  assert.deepEqual(kept.map(({ category, file: where }) => [category, where]), [["magic_value", file]]);
});
