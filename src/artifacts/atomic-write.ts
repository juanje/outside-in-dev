import { renameSync, writeFileSync } from "node:fs";

/** Writes the file atomically: a temporary file in the same directory, then a rename. */
export function writeFileAtomic(path: string, text: string): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}
