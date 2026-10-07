type Part = { type: string; text?: string };

/** The text of a tool result: its text parts joined, other parts left out. */
export function textOf(parts: Part[]): string {
  return parts.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
}

/** A tool result's content holding only `text`. */
export function textContent(text: string): { type: "text"; text: string }[] {
  return [{ type: "text", text }];
}
