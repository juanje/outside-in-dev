import { renameSync, writeFileSync } from "node:fs";

/** Writes the file atomically: a temporary file in the same directory, then a rename. `mode` is the permission of the new file (the default of the system without it). */
export function writeFileAtomic(path: string, text: string, mode?: number): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, path);
}
