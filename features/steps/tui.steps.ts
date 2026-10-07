import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import type { OidWorld } from "../support/world.js";
import type { OIEventBody } from "../../src/events/types.js";

type PlainRun = { runId: string; printed: string; exitCode: number | undefined };
type SavedSession = { runId: string; state?: string; pendingInput: { prompt: string; actions: { key: string }[] } | null };
type LoggedEvent = { ts: number; runId: string; type: string };

const runs = new WeakMap<OidWorld, PlainRun>();
const CLOCK = 1_700_000_000_000;

function runOf(world: OidWorld): PlainRun {
  const found = runs.get(world);
  assert.ok(found, "no run was set up");
  return found;
}

function printedLines(world: OidWorld): string[] {
  const { printed } = runOf(world);
  return printed === "" ? [] : printed.replace(/\n$/, "").split("\n");
}

function eventLog(world: OidWorld): LoggedEvent[] {
  const path = world.path(`.outside-in/runs/${runOf(world).runId}/events.jsonl`);
  return readFileSync(path, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line) as LoggedEvent);
}

function savedSession(world: OidWorld): SavedSession {
  return JSON.parse(readFileSync(world.path(".outside-in/session.json"), "utf8")) as SavedSession;
}

async function emit(world: OidWorld, event: OIEventBody): Promise<void> {
  const run = runOf(world);
  const { createEventBus } = await import("../../src/events/bus.js");
  const bus = createEventBus({
    cwd: world.dir,
    runId: run.runId,
    write: (text: string) => (run.printed += text),
    now: () => CLOCK,
  });
  const exitCode = bus.emit(event);
  if (exitCode !== undefined) run.exitCode = exitCode;
}

function actionsOf(first: string, second: string): { key: string; label: string }[] {
  return [first, second].map((name) => ({ key: name, label: name }));
}

function question(prompt: string, first: string, second: string): OIEventBody {
  return { type: "waiting_input", request: { id: "request-1", prompt, actions: actionsOf(first, second) } };
}

Given("a git project with {string}", function (this: OidWorld, directory: string) {
  this.git("init", "-q");
  mkdirSync(this.path(directory), { recursive: true });
});

Given("a run {string} whose output is not a terminal", function (this: OidWorld, runId: string) {
  runs.set(this, { runId, printed: "", exitCode: undefined });
});

Given(
  "a saved session of the run {string} with no pending input and the state {string}",
  function (this: OidWorld, runId: string, state: string) {
    this.write(".outside-in/session.json", JSON.stringify({ runId, state, pendingInput: null }));
  },
);

When(
  "oid emits a state change from {string} to {string} because {string} for {string}",
  async function (this: OidWorld, from: string, to: string, reason: string, fr: string) {
    await emit(this, { type: "state_change", from, to, reason, fr });
  },
);

When("oid emits the error {string}", async function (this: OidWorld, message: string) {
  await emit(this, { type: "error", message });
});

When(
  "oid emits the error {string} with a detail of two lines, {string} and {string}",
  async function (this: OidWorld, message: string, first: string, second: string) {
    await emit(this, { type: "error", message, detail: `${first}\n${second}` });
  },
);

When(
  "oid emits a question {string} with the actions {string} and {string}",
  async function (this: OidWorld, prompt: string, first: string, second: string) {
    await emit(this, question(prompt, first, second));
  },
);

Then("oid prints exactly one line", function (this: OidWorld) {
  assert.equal(printedLines(this).length, 1, runOf(this).printed);
});

Then("oid prints {int} lines", function (this: OidWorld, count: number) {
  assert.equal(printedLines(this).length, count, runOf(this).printed);
});

function mentions(line: string | undefined, words: string[]): void {
  assert.ok(line !== undefined, "no such line");
  for (const word of words) assert.ok(line.includes(word), `"${line}" does not mention "${word}"`);
}

Then("the line mentions {string}, {string}, {string} and {string}", function (this: OidWorld, a: string, b: string, c: string, d: string) {
  mentions(printedLines(this)[0], [a, b, c, d]);
});

Then("the line mentions {string}, {string} and {string}", function (this: OidWorld, a: string, b: string, c: string) {
  mentions(printedLines(this)[0], [a, b, c]);
});

Then("the line mentions {string} and {string}", function (this: OidWorld, a: string, b: string) {
  mentions(printedLines(this)[0], [a, b]);
});

Then("the first line mentions {string}", function (this: OidWorld, word: string) {
  mentions(printedLines(this)[0], [word]);
});

Then("the second line mentions {string}", function (this: OidWorld, word: string) {
  mentions(printedLines(this)[1], [word]);
});

Then("{string} has {int} lines", function (this: OidWorld, path: string, count: number) {
  assert.equal(readFileSync(this.path(path), "utf8").trimEnd().split("\n").length, count);
});

Then("each line of the event log is a JSON event of the run {string} with a timestamp", function (this: OidWorld, runId: string) {
  for (const event of eventLog(this)) {
    assert.equal(event.runId, runId);
    assert.equal(event.ts, CLOCK);
  }
});

Then("the event log records a {string} and then an {string}", function (this: OidWorld, first: string, second: string) {
  assert.deepEqual(eventLog(this).map((event) => event.type), [first, second]);
});

Then("the event log records a {string}", function (this: OidWorld, type: string) {
  assert.deepEqual(eventLog(this).map((event) => event.type), [type]);
});

Then("oid prints a line with the question {string}", function (this: OidWorld, prompt: string) {
  assert.ok(printedLines(this).some((line) => line.includes(prompt)), runOf(this).printed);
});

Then("the line mentions the actions {string} and {string}", function (this: OidWorld, first: string, second: string) {
  const line = printedLines(this).find((candidate) => candidate.includes(first));
  mentions(line, [first, second]);
});

Then("the process exits with code {int}", function (this: OidWorld, code: number) {
  assert.equal(runOf(this).exitCode, code);
});

Then("{string} is valid JSON", function (this: OidWorld, path: string) {
  assert.doesNotThrow(() => JSON.parse(readFileSync(this.path(path), "utf8")));
});

Then("the session records the run {string}", function (this: OidWorld, runId: string) {
  assert.equal(savedSession(this).runId, runId);
});

Then(
  "the session's pending input is the question {string} with the actions {string} and {string}",
  function (this: OidWorld, prompt: string, first: string, second: string) {
    const pending = savedSession(this).pendingInput;
    assert.ok(pending !== null);
    assert.equal(pending.prompt, prompt);
    assert.deepEqual(pending.actions.map((action) => action.key), [first, second]);
  },
);

Then("the session still has the state {string}", function (this: OidWorld, state: string) {
  assert.equal(savedSession(this).state, state);
});

Then("no temporary session file is left in {string}", function (this: OidWorld, directory: string) {
  assert.ok(existsSync(this.path(directory)));
  assert.deepEqual(readdirSync(this.path(directory)).filter((name) => name.endsWith(".tmp")), []);
});
