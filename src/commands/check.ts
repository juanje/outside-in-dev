import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPEC_FILE, validateSpec } from "../artifacts/spec.js";
import type { CliIo } from "../cli-io.js";

export function runCheck(io: CliIo): void {
  const text = readFileSync(join(io.cwd, SPEC_FILE), "utf8");
  const violations = validateSpec(text);
  for (const { id, kind } of violations) {
    io.stdout(`${SPEC_FILE}: ${id}: ${kind}\n`);
  }
  if (violations.length === 0) io.stdout("no violations\n");
}
