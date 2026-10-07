import type { Agent } from "@earendil-works/pi-agent-core";
import { textContent, textOf } from "./result-text.js";

/** What edit-hints needs of a session: the hook to chain to. */
export type HintedSession = { agent: Pick<Agent, "afterToolCall"> };

const EDIT = "edit";
/** Pi's three messages for an edit that cannot be applied (single and multi-edit forms), each with the hint that fixes it. */
const HINTS: [RegExp, string][] = [
  [/^Could not find /, "Hint: copy the anchor exactly, with spaces and line breaks; read the file again first."],
  [/^Found \d+ occurrences /, "Hint: add more surrounding lines to make it unique."],
  [/^No changes made /, "Hint: the replacement is identical to the original, so nothing changed."],
];

function hintFor(message: string): string | undefined {
  return HINTS.find(([pattern]) => pattern.test(message))?.[1];
}

/** Installs, on `session.agent.afterToolCall` and chained to the hook already there, a hint appended to the error of a failed `edit`. */
export function installEditHints(session: HintedSession): void {
  const original = session.agent.afterToolCall;
  session.agent.afterToolCall = async (context, signal) => {
    const prior = await original?.(context, signal);
    if (context.toolCall.name !== EDIT || !context.isError) return prior;
    const parts = prior?.content ?? context.result.content;
    const message = textOf(parts);
    const hint = hintFor(message);
    if (hint === undefined) return prior;
    return { ...prior, content: textContent(`${message}\n\n${hint}`) };
  };
}
