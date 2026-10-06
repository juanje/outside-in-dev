import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";
import { loadProjectPaths, type ProjectPaths } from "../artifacts/project-paths.js";
import { parseRequirements, validateSpec } from "../artifacts/spec.js";
import { checkProgressConsistency } from "../artifacts/consistency.js";
import { loadProgress, ProgressError } from "../artifacts/progress.js";
import { checkTraceability, listScenarios } from "../artifacts/traceability.js";
import type { CliIo } from "../cli-io.js";

function readFeatureSources(cwd: string, globs: string[]) {
  return globSync(globs, { cwd })
    .sort()
    .map((path) => ({ path, text: readFileSync(join(cwd, path), "utf8") }));
}

type Violation = { check: "config" | "spec" | "traceability" | "progress"; message: string };

function reportJson(io: CliIo, violations: Violation[]): void {
  io.stdout(`${JSON.stringify({ ok: violations.length === 0, violations })}\n`);
}

export function runCheck(io: CliIo, json = false): number {
  let paths: ProjectPaths;
  try {
    paths = loadProjectPaths(io.cwd);
  } catch (error) {
    if (!json || !(error instanceof ProgressError)) throw error;
    reportJson(io, [{ check: "config", message: error.message }]);
    return 1;
  }
  const specPath = join(io.cwd, paths.spec);
  const specFound = existsSync(specPath);
  const text = specFound ? readFileSync(specPath, "utf8") : "";
  const violations: Violation[] = specFound
    ? validateSpec(text).map(({ id, kind }) => ({ check: "spec", message: `${paths.spec}: ${id}: ${kind}` }))
    : [{ check: "spec", message: `${paths.spec} not found` }];
  const knownIds = parseRequirements(text).map((requirement) => requirement.id);
  const sources = readFeatureSources(io.cwd, paths.features);
  for (const { file, scenario, kind } of checkTraceability(sources, knownIds)) {
    violations.push({ check: "traceability", message: `${file}: ${scenario ? `${scenario}: ` : ""}${kind}` });
  }
  if (existsSync(join(io.cwd, paths.progress))) {
    try {
      const progress = loadProgress(io.cwd, paths.progress);
      for (const { feature, scenario, kind } of checkProgressConsistency(progress, listScenarios(sources))) {
        violations.push({
          check: "progress",
          message: `${paths.progress}: ${feature}: ${scenario ? `${scenario}: ` : ""}${kind}`,
        });
      }
    } catch (error) {
      if (!(error instanceof ProgressError)) throw error;
      violations.push({ check: "progress", message: error.message });
    }
  }
  const ok = violations.length === 0;
  if (json) {
    reportJson(io, violations);
  } else {
    for (const { message } of violations) io.stdout(`${message}\n`);
    if (ok) io.stdout("no violations\n");
  }
  return ok ? 0 : 1;
}
