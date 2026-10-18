import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { NEWLINE } from "../../artifacts/lines.js";
import { unitTargetOf } from "../../artifacts/verify-target.js";
import { type CycleState, TDD_RED } from "../profiles.js";
import { isRejection, type Rejection, rejection, renderRejection } from "../../artifacts/rejection.js";

const text = z.string();
const DONE_STATUS = "done";
const BLOCKED_STATUS = "blocked";
const TEXT_CONTENT = "text";
const DONE = z.literal(DONE_STATUS);
const done = z.object({ status: DONE, files: z.array(text), summary: text, test: text.optional() }).strict();
const doneWithoutFiles = z.object({ status: DONE, files: z.array(text).length(0), summary: text, reason: z.literal("no_unit_logic_left") }).strict();
const blocked = z.object({ status: z.literal(BLOCKED_STATUS), reason: z.enum(["spec_conflict", "spec_gap", "cannot_test", "other"]), detail: text }).strict();
const reportShape = z.union([done, doneWithoutFiles, blocked]);

/** What an agent states when it ends: that it finished and which files it changed, or that it is blocked and why. */
export type AgentReport = z.infer<typeof reportShape>;

/** The report an agent's `report` call carries, or `undefined` when the arguments are not one of the three shapes. */
export function parseReport(args: unknown): AgentReport | undefined {
  const parsed = reportShape.safeParse(args);
  return parsed.success ? parsed.data : undefined;
}

const NO_LOGIC_REASON = "no_unit_logic_left";
const NO_LOGIC_FORM = `status: done, files: [], summary and reason: ${NO_LOGIC_REASON}`;
const BLOCKED_FORM = "status: blocked, reason (spec_conflict, spec_gap, cannot_test or other) and detail";
const DONE_FORM = "status: done, files (every file you changed), summary, and test in a test step";

/** The form a report is meant to have, by what it says: blocked, no unit logic left, or done with files. */
function formOf(args: unknown): { schema: z.ZodType; form: string } {
  const { status, reason } = (typeof args === "object" && args !== null ? args : {}) as { status?: unknown; reason?: unknown };
  if (status === BLOCKED_STATUS) return { schema: blocked, form: BLOCKED_FORM };
  return reason === NO_LOGIC_REASON ? { schema: doneWithoutFiles, form: NO_LOGIC_FORM } : { schema: done, form: DONE_FORM };
}

/** The rejection of a report that has none of the three forms: the fields that are extra or wrong, and the form its status asks for. */
function refusalOf(args: unknown): Rejection {
  const { schema, form } = formOf(args);
  const result = schema.safeParse(args);
  const issues = result.success ? [] : result.error.issues;
  const lines = issues.flatMap((issue) => (issue.code === "unrecognized_keys" ? issue.keys.map((key) => `${key}: not allowed in this form`) : [`${issue.path.join(".")}: ${issue.message}`]));
  return rejection({ failed: "The report is not valid", evidence: lines.join(NEWLINE), next: `call report again as ${form}` });
}

/** The name of the tool every agent ends by calling. */
export const REPORT_TOOL = "report";
const REASONS = ["spec_conflict", "spec_gap", "cannot_test", "other", "no_unit_logic_left"];

/** The `report` tool: every agent ends by calling it. The schema is one flat object, because a provider may refuse a top-level choice; the three shapes are enforced on the call itself. */
export function reportToolFor(state?: CycleState) {
  return defineTool({
    name: REPORT_TOOL,
    label: "Report",
    description:
      "Call this last, exactly once, to end your task. status done: list every file you changed, added or deleted in files and say what you did in summary (in a test step, name the new test in test; when no unit logic is left, give files [] and reason no_unit_logic_left). status blocked: give reason (spec_conflict, spec_gap, cannot_test or other) and detail.",
    parameters: Type.Object({
      status: Type.Union([Type.Literal(DONE_STATUS), Type.Literal(BLOCKED_STATUS)]),
      files: Type.Optional(Type.Array(Type.String())),
      summary: Type.Optional(Type.String()),
      test: Type.Optional(Type.String()),
      reason: Type.Optional(Type.Union(REASONS.map((reason) => Type.Literal(reason)))),
      detail: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const report = parseReport(params);
      if (report === undefined) throw new Error(renderRejection(refusalOf(params)));
      const { test } = report as { test?: string };
      if (state === TDD_RED && test !== undefined) {
        const target = unitTargetOf(test);
        if (isRejection(target)) throw new Error(renderRejection(target));
      }
      return { content: [{ type: TEXT_CONTENT, text: "Report received." }], details: {} };
    },
  });
}

/** The `report` tool of a session that is not tied to a step, which applies no rule of a step. */
export const reportTool = reportToolFor();
