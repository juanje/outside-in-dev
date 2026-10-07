import { type AgentReport, parseReport, REPORT_TOOL } from "./tools/report.js";

const STARTED = "tool_execution_start";
const ENDED = "tool_execution_end";

type ToolEvent = { type?: string; toolCallId?: string; toolName?: string; args?: unknown; isError?: boolean };

/** The report an agent ended with: the last call of the `report` tool that succeeded and carried a valid report. Pi's end event has no arguments, so each is paired with its start event by call id. */
export function collectReport(events: readonly unknown[]): AgentReport | undefined {
  const calls = new Map<string, unknown>();
  let report: AgentReport | undefined;
  for (const event of events as ToolEvent[]) {
    if (event.toolName !== REPORT_TOOL || event.toolCallId === undefined) continue;
    if (event.type === STARTED) calls.set(event.toolCallId, event.args);
    if (event.type === ENDED && event.isError !== true && calls.has(event.toolCallId)) report = parseReport(calls.get(event.toolCallId)) ?? report;
  }
  return report;
}
