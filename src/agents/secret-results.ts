import { resolve } from "node:path";
import { isSecret } from "./secrets.js";

const NEWLINE = "\n";
const NOTICE = /\n\n\[[^\n]*\]$/;
const NO_RESULT = new Set(["No matches found", "No files found matching pattern", "(empty directory)"]);
const GREP_POSITION = /[:-]\d+[:-] /g;
const UNCHECKABLE = "The result was blocked: it could not be checked for secret files, so none of it is shown.";

/** Thrown when a line cannot be attributed to a file: the whole result is then withheld. */
class Unattributable extends Error {}

function pathCandidates(line: string): string[] {
  const candidates = [...line.matchAll(GREP_POSITION)].map((found) => line.slice(0, found.index));
  if (candidates.length === 0) throw new Unattributable();
  return candidates;
}

function isSecretLine(tool: string, line: string, directory: string, worktree: string): boolean {
  const names = tool === "grep" ? pathCandidates(line) : [line.replace(/\/$/, "")];
  return names.some((name) => isSecret(worktree, resolve(worktree, directory, name)));
}

function redact(tool: string, text: string, directory: string, worktree: string): string {
  if (NO_RESULT.has(text)) return text;
  const notice = NOTICE.exec(text)?.[0] ?? "";
  const body = text.slice(0, text.length - notice.length);
  const kept = body.split(NEWLINE).filter((line) => line !== "" && !isSecretLine(tool, line, directory, worktree));
  return kept.length === 0 ? "(nothing left to show: the matches were in secret files)" : `${kept.join(NEWLINE)}${notice}`;
}

/** What the agent is shown of a `grep`, `find` or `ls` result: the entries and lines of secret files are removed; a line that cannot be attributed to a file withholds the whole result. */
export function withoutSecrets(tool: string, text: string, directory: string, worktree: string): string {
  try {
    return redact(tool, text, directory, worktree);
  } catch (error) {
    if (error instanceof Unattributable) return UNCHECKABLE;
    throw error;
  }
}
