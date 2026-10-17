import { expect } from "vitest";
import { codeIntro, featureIntro, workflowIntro } from "../../src/agents/prompts/shared.js";
import { REPORT_TOOL } from "../../src/agents/tools/report.js";

/** Which shared start a prompt is built on: the agents that run the project's checks, the ones that also change code, and the one that writes feature files. */
export type Intro = "workflow" | "code" | "feature";

const INTROS = { workflow: workflowIntro, code: codeIntro, feature: featureIntro };

/** A stand-in identity: what an intro adds after the identity is the shared part, whatever its text. */
const MARK = "IDENTITY";

/** The shared part an intro adds after the identity of an agent. The constants behind it stay private to the prompts module (a test-only export would be dead code to the detector), so the tests take them from the intro functions. */
function sharedTail(intro: Intro): string {
  return INTROS[intro](MARK).slice(MARK.length);
}

/** What the intro of an agent that changes code holds over that of an agent that only checks: the fix-at-cause trait. */
function traitPart(): string {
  const code = sharedTail("code");
  const workflow = sharedTail("workflow");
  expect(code.endsWith(workflow)).toBe(true);
  expect(code.length, "an agent that changes code holds nothing over one that only checks").toBeGreaterThan(workflow.length);
  return code.slice(0, code.length - workflow.length);
}

/** How many times `part` occurs in `text`. */
function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

/** A line this long is a shared paragraph or a rule, never a heading or a list entry. */
const LONG_LINE = 80;

/** Asserts how a prompt starts: its identity (one paragraph, nothing before it), then the shared start of its kind, each shared part exactly once, and the traits of the other kinds absent (the fix-at-cause trait only in the agents that change code). No long line occurs twice, so no shared paragraph is repeated. */
export function expectIntro(prompt: string, kind: Intro): void {
  const tail = sharedTail(kind);
  const at = prompt.indexOf(tail);
  expect(at, "the shared start of the prompt is missing").toBeGreaterThan(0);
  const identity = prompt.slice(0, at);
  expect(identity).not.toContain("\n");
  expect(prompt.startsWith(INTROS[kind](identity))).toBe(true);
  expect(occurrences(prompt, tail)).toBe(1);
  expect(occurrences(prompt, traitPart())).toBe(kind === "code" ? 1 : 0);
  expect(occurrences(prompt, sharedTail("workflow"))).toBe(kind === "feature" ? 0 : 1);
  expect(occurrences(prompt, sharedTail("feature"))).toBe(kind === "feature" ? 1 : 0);
  const long = prompt.split("\n").filter((line) => line.length >= LONG_LINE);
  expect(new Set(long).size).toBe(long.length);
}

/** Asserts that the rules of a prompt are numbered from 1 with no gap, and that the last line of the prompt is the last rule is the instruction to call the report tool (a rule that only mentions it, as an earlier rule may, does not count): every agent ends by reporting. */
export function expectProcedure(prompt: string): void {
  const lines = prompt.trimEnd().split("\n");
  const numbers = lines.flatMap((line) => /^(\d+)\. /.exec(line)?.[1] ?? []).map(Number);
  expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  expect(numbers.length).toBeGreaterThan(0);
  expect(lines.at(-1)).toMatch(new RegExp(`^${numbers.length}\\. Call the ${REPORT_TOOL} tool`));
}

/** Asserts that a prompt names neither the stack nor the tools of this project: the prompts are the same for any project. */
export function expectNoStackNames(prompt: string): void {
  expect(prompt).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
}
