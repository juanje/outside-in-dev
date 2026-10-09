import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CALL_LOG = join(".outside-in", "replay-calls.ndjson");

/** Every call log of the replay scripts under `dir`: the project and the worktrees of a run each keep their own. */
export function replayLogs(dir: string): string[] {
  const found: string[] = [];
  const visit = (current: string, depth: number): void => {
    if (existsSync(join(current, CALL_LOG))) found.push(join(current, CALL_LOG));
    if (depth === 0) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") visit(join(current, entry.name), depth - 1);
  };
  visit(dir, 4);
  return found;
}

/** The calls the replay scripts of a failed scenario answered or refused, one line each, with the file they were logged in; empty when no script ran. */
export function replayCallsText(dir: string): string {
  return replayLogs(dir)
    .map((log) => `${log}\n${readFileSync(log, "utf8")}`)
    .join("\n");
}
