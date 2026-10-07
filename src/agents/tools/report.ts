import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

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

/** The name of the tool every agent ends by calling. */
export const REPORT_TOOL = "report";
const REASONS = ["spec_conflict", "spec_gap", "cannot_test", "other", "no_unit_logic_left"];

/** The `report` tool: every agent ends by calling it. The schema is one flat object, because a provider may refuse a top-level choice; the three shapes are enforced on the call itself. */
export const reportTool = defineTool({
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
    if (parseReport(params) === undefined) throw new Error("The report is not valid: done needs files and summary; blocked needs a reason and a detail. Call report again.");
    return { content: [{ type: TEXT_CONTENT, text: "Report received." }], details: {} };
  },
});
