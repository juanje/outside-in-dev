import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRequirements, SPEC_FILE, validateSpec } from "../artifacts/spec.js";
import { checkProgressConsistency } from "../artifacts/consistency.js";
import { loadProgress, PROGRESS_FILE, ProgressError } from "../artifacts/progress.js";
import { checkTraceability, listScenarios } from "../artifacts/traceability.js";
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
  const sources = readFeatureSources(io.cwd);
  for (const { file, scenario, kind } of checkTraceability(sources, knownIds)) {
    reports.push(`${file}: ${scenario}: ${kind}`);
  }
  if (existsSync(join(io.cwd, PROGRESS_FILE))) {
    try {
      const progress = loadProgress(io.cwd);
      for (const { feature, scenario, kind } of checkProgressConsistency(progress, listScenarios(sources))) {
        reports.push(`${PROGRESS_FILE}: ${feature}: ${scenario ? `${scenario}: ` : ""}${kind}`);
      }
    } catch (error) {
      if (!(error instanceof ProgressError)) throw error;
      reports.push(error.message);
    }
  }
  for (const report of reports) io.stdout(`${report}\n`);
  if (reports.length === 0) io.stdout("no violations\n");
}
