import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ProgressError } from "./progress.js";

export const SPEC_FILE = "SPEC.md";

const REQUIREMENT_HEADING = /^### (FR-[A-Z][A-Z0-9]*-\d{2,3}): (.+)$/;

export function readRequirementIds(cwd: string): string[] {
  const path = join(cwd, SPEC_FILE);
  if (!existsSync(path)) {
    throw new ProgressError(`${SPEC_FILE} not found in ${cwd}`);
  }
  const ids: string[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = REQUIREMENT_HEADING.exec(line);
    if (match) ids.push(match[1]!);
  }
  return ids;
}
