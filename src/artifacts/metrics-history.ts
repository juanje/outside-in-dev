import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "./snapshot.js";

const HISTORY_DIR = ".outside-in";
const HISTORY_FILE = "metrics.jsonl";

function historyPath(cwd: string): string {
  return join(cwd, HISTORY_DIR, HISTORY_FILE);
}

/** Adds `snapshot` as one JSON line at the end of the metrics history of the project, creating the file and its directory when missing. */
export function appendSnapshot(cwd: string, snapshot: Snapshot): void {
  mkdirSync(join(cwd, HISTORY_DIR), { recursive: true });
  appendFileSync(historyPath(cwd), `${JSON.stringify(snapshot)}\n`);
}

/** The snapshot added last to the metrics history of the project, or `undefined` when there is none. */
export function readLastSnapshot(cwd: string): Snapshot | undefined {
  if (!existsSync(historyPath(cwd))) return undefined;
  const last = readFileSync(historyPath(cwd), "utf8").split("\n").filter((line) => line !== "").at(-1);
  return last === undefined ? undefined : (JSON.parse(last) as Snapshot);
}
