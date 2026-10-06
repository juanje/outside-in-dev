export const NEWLINE = "\n";

/** The first line of a text. */
export function firstLine(text: string): string {
  return text.split(NEWLINE, 1)[0]!;
}
