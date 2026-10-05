import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRequirements, SPEC_FILE, validateSpec } from "../artifacts/spec.js";
import { checkTraceability } from "../artifacts/traceability.js";
import type { CliIo } from "../cli-io.js";

const FEATURES_DIR = "features";
const FEATURE_EXTENSION = ".feature";

function readFeatureSources(cwd: string) {
  const dir = join(cwd, FEATURES_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(FEATURE_EXTENSION))
    .sort()
    .map((name) => {
      const path = `${FEATURES_DIR}/${name}`;
      return { path, text: readFileSync(join(cwd, path), "utf8") };
    });
}

export function runCheck(io: CliIo): void {
  const text = readFileSync(join(io.cwd, SPEC_FILE), "utf8");
  const reports = validateSpec(text).map(({ id, kind }) => `${SPEC_FILE}: ${id}: ${kind}`);
  const knownIds = parseRequirements(text).map((requirement) => requirement.id);
  for (const { file, scenario, kind } of checkTraceability(readFeatureSources(io.cwd), knownIds)) {
    reports.push(`${file}: ${scenario}: ${kind}`);
  }
  for (const report of reports) io.stdout(`${report}\n`);
  if (reports.length === 0) io.stdout("no violations\n");
}
