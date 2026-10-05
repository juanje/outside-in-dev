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

type Violation = { check: "spec" | "traceability" | "progress"; message: string };

export function runCheck(io: CliIo, json = false): number {
  const specPath = join(io.cwd, SPEC_FILE);
  const specFound = existsSync(specPath);
  const text = specFound ? readFileSync(specPath, "utf8") : "";
  const violations: Violation[] = specFound
    ? validateSpec(text).map(({ id, kind }) => ({ check: "spec", message: `${SPEC_FILE}: ${id}: ${kind}` }))
    : [{ check: "spec", message: `${SPEC_FILE} not found` }];
  const knownIds = parseRequirements(text).map((requirement) => requirement.id);
  const sources = readFeatureSources(io.cwd);
  for (const { file, scenario, kind } of checkTraceability(sources, knownIds)) {
    violations.push({ check: "traceability", message: `${file}: ${scenario ? `${scenario}: ` : ""}${kind}` });
  }
  if (existsSync(join(io.cwd, PROGRESS_FILE))) {
    try {
      const progress = loadProgress(io.cwd);
      for (const { feature, scenario, kind } of checkProgressConsistency(progress, listScenarios(sources))) {
        violations.push({
          check: "progress",
          message: `${PROGRESS_FILE}: ${feature}: ${scenario ? `${scenario}: ` : ""}${kind}`,
        });
      }
    } catch (error) {
      if (!(error instanceof ProgressError)) throw error;
      violations.push({ check: "progress", message: error.message });
    }
  }
  const ok = violations.length === 0;
  if (json) {
    io.stdout(`${JSON.stringify({ ok, violations })}\n`);
  } else {
    for (const { message } of violations) io.stdout(`${message}\n`);
    if (ok) io.stdout("no violations\n");
  }
  return ok ? 0 : 1;
}
