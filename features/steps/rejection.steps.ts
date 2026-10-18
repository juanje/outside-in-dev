import { Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { OidWorld } from "../support/world.js";
import { blockedReason, reportRefusal, tryAnswer } from "./agent.steps.js";
import { eventLog } from "./run.steps.js";

const EVIDENCE_HEADING = "Evidence:";
const NEXT_LABEL = "Next:";
const NEWLINE = "\n";

/** A rejection as it is printed: the first line, the lines under "Evidence:" and the text after "Next:". */
type Printed = { first: string; evidence: string[]; next: string };

/** The words each `Next:` must hold, by what the feature says it tells the reader to do. Words, not whole sentences: the wording of the text is free, its content is not. */
const NEXT_WORDS: Record<string, string[]> = {
  "tells the agent to define the undefined step in a step file": ["define", "step"],
  "tells the agent to name the unit test it wrote in the report": ["report", "test"],
  "tells the agent to check the unit test with the try tool": ["try"],
  "tells the agent to fix the errors and run the linter on the file": ["fix", "lint"],
  "tells the agent to fix the step definitions so the scenario fails on the missing behaviour": ["step definitions", "behaviour"],
  "tells the agent to test a behaviour the code does not have yet": ["behaviour the code does not have yet"],
  "tells the author to fix what failed and to run": ["fix", "oid try"],
  "tells the author to test a behaviour the code does not have yet and to run": ["behaviour the code does not have yet", "oid verify red"],
  "tells the author to fix the code, not the tests, and to run": ["fix the code", "oid verify green"],
  "names a test or a scenario of this project": ["test", "scenario"],
};

/** The rejection printed in a text; fails when the text lacks the first line, the evidence or the next action. */
function printed(text: string): Printed {
  const lines = text.split(NEWLINE);
  const at = lines.findIndex((line) => line.trim() === EVIDENCE_HEADING);
  const nextAt = lines.findIndex((line) => line.startsWith(NEXT_LABEL));
  assert.ok(at > 0 && nextAt > at, `the text has no first line, "${EVIDENCE_HEADING}" and "${NEXT_LABEL}" in this order:\n${text}`);
  const evidence = lines.slice(at + 1, nextAt).filter((line) => line.trim() !== "");
  const next = [lines[nextAt]!.slice(NEXT_LABEL.length), ...lines.slice(nextAt + 1)].join(NEWLINE).trim();
  assert.ok(lines[0]!.trim() !== "" && evidence.length > 0 && next !== "", `a part of the rejection is empty:\n${text}`);
  return { first: lines[0]!, evidence, next };
}

/** The text of the thing the step speaks about. */
function textOf(world: OidWorld, subject: string): string {
  if (subject === "that reason") {
    const rejected = eventLog(world).find((event) => event.type === "attempt_rejected") as { reason?: string } | undefined;
    assert.ok(rejected?.reason, "the event log holds no attempt_rejected");
    return rejected.reason;
  }
  if (subject === "the output") return world.stdout;
  if (subject === "the report refusal") return reportRefusal(world);
  return subject === "the reason" ? blockedReason(world) : tryAnswer(world);
}

const SUBJECT = "(that reason|the output|the report refusal|the reason|the refusal)";

Then(new RegExp(`^${SUBJECT} has the evidence "Evidence:" naming (.+)$`), function (this: OidWorld, subject: string, naming: string) {
  const { evidence } = printed(textOf(this, subject));
  const quoted = [...naming.matchAll(/"([^"]+)"/g)].map(([, text]) => text!);
  const expected = quoted.length > 0 ? quoted : ["cart"];
  for (const text of expected) assert.ok(evidence.join(NEWLINE).includes(text), `the evidence does not name "${text}":\n${evidence.join(NEWLINE)}`);
});

/** The labels of a path denial: the feature names them by their words, the step compares the text with the sandbox's own constants. */
async function pathLabels(): Promise<Record<string, string | undefined>> {
  const { READ_LABEL, WRITE_LABEL } = (await import("../../src/agents/sandbox.js")) as { READ_LABEL?: string; WRITE_LABEL?: string };
  return { "You may read:": READ_LABEL, "You may write": WRITE_LABEL };
}

/** The label the feature names, as the sandbox prints it; fails when the sandbox does not export it. */
function labelOf(labels: Record<string, string | undefined>, name: string): string {
  const label = labels[name];
  assert.ok(label !== undefined, `the sandbox exports no label for "${name}"`);
  return label;
}

Then(new RegExp(`^${SUBJECT} has a "Next:" that (.+)$`), async function (this: OidWorld, subject: string, action: string) {
  const { next } = printed(textOf(this, subject));
  const begins = action.match(/^begins with "([^"]+)" and names "([^"]+)"$/);
  const excluded = action.match(/^does not name "([^"]+)"$/);
  if (begins !== null) {
    assert.ok(next.startsWith(labelOf(await pathLabels(), begins[1]!)), `the next action does not begin with "${begins[1]}":\n${next}`);
    assert.ok(next.includes(begins[2]!), `the next action does not hold "${begins[2]}":\n${next}`);
    return;
  }
  if (excluded !== null) {
    assert.ok(!next.includes(labelOf(await pathLabels(), excluded[1]!)), `the next action holds "${excluded[1]}":\n${next}`);
    return;
  }
  const quoted = action.match(/^names "([^"]+)"$/)?.[1];
  const afterVerifying = action.match(/^names the command "([^"]+)" after verifying the Red$/)?.[1];
  const fields = action.match(/^names the fields (.+)$/);
  const fieldWords = fields === null ? undefined : [...fields[1]!.matchAll(/"([^"]+)"/g)].map(([, word]) => word!);
  const phrase = Object.keys(NEXT_WORDS).find((key) => action.startsWith(key));
  const words = quoted !== undefined ? [quoted] : afterVerifying !== undefined ? [afterVerifying, "verify"] : fieldWords ?? (phrase === undefined ? undefined : NEXT_WORDS[phrase]);
  assert.ok(words, `no words are known for: ${action}`);
  for (const word of words) assert.ok(next.toLowerCase().includes(word.toLowerCase()), `the next action does not hold "${word}":\n${next}`);
});

Then("that reason does not contain the evidence of a missing report", async function (this: OidWorld) {
  const { NO_REPORT_EVIDENCE } = (await import("../../src/agents/runner.js")) as { NO_REPORT_EVIDENCE?: string };
  assert.ok(typeof NO_REPORT_EVIDENCE === "string" && NO_REPORT_EVIDENCE !== "", "the runner exports no evidence for a missing report");
  const text = textOf(this, "that reason");
  assert.ok(!text.includes(NO_REPORT_EVIDENCE), `the reason holds the evidence of a missing report:\n${text}`);
});

Then("the reason says {string}", function (this: OidWorld, text: string) {
  assert.ok(blockedReason(this).includes(text), `the reason does not say "${text}":\n${blockedReason(this)}`);
});

Then(/^the plain output line of the "attempt_rejected" of "([A-Z_]+)" is cut and still contains "(.+)"$/, function (this: OidWorld, state: string, text: string) {
  const line = this.stdout.split(NEWLINE).find((candidate) => candidate.startsWith(`[${state}] attempt 1 rejected:`));
  assert.ok(line, `the output has no line for the rejected attempt of ${state}:\n${this.stdout}`);
  assert.ok(line.includes("…"), `the line is not cut: ${line}`);
  assert.ok(line.includes(text), `the cut line lost "${text}": ${line}`);
});
