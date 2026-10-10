/** The text with the characters a regular expression gives a meaning escaped, so it matches itself. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
