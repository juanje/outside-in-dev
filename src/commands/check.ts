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

type Source = ReturnType<typeof readFeatureSources>[number];

function checkSpecFile(io: CliIo, paths: ProjectPaths): { text: string; violations: Violation[] } {
  const specPath = join(io.cwd, paths.spec);
  if (!existsSync(specPath)) return { text: "", violations: [{ check: "spec", message: `${paths.spec} not found` }] };
  const text = readFileSync(specPath, "utf8");
  return { text, violations: validateSpec(text).map(({ id, kind }) => ({ check: "spec", message: `${paths.spec}: ${id}: ${kind}` })) };
}

function checkFeatureTags(sources: Source[], knownIds: string[]): Violation[] {
  return checkTraceability(sources, knownIds).map(({ file, scenario, kind }) => ({
    check: "traceability",
    message: `${file}: ${scenario ? `${scenario}: ` : ""}${kind}`,
  }));
}

function checkProgressFile(io: CliIo, paths: ProjectPaths, sources: Source[]): Violation[] {
  if (!existsSync(join(io.cwd, paths.progress))) return [];
  try {
    const progress = loadProgress(io.cwd, paths.progress);
    return checkProgressConsistency(progress, listScenarios(sources)).map(({ feature, scenario, kind }) => ({
      check: "progress",
      message: `${paths.progress}: ${feature}: ${scenario ? `${scenario}: ` : ""}${kind}`,
    }));
  } catch (error) {
    if (!(error instanceof ProgressError)) throw error;
    return [{ check: "progress", message: error.message }];
  }
}

function report(io: CliIo, violations: Violation[], json: boolean): void {
  if (json) {
    reportJson(io, violations);
    return;
  }
  for (const { message } of violations) io.stdout(`${message}\n`);
  if (violations.length === 0) io.stdout("no violations\n");
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
  const spec = checkSpecFile(io, paths);
  const sources = readFeatureSources(io.cwd, paths.features);
  const knownIds = parseRequirements(spec.text).map((requirement) => requirement.id);
  const violations = [...spec.violations, ...checkFeatureTags(sources, knownIds), ...checkProgressFile(io, paths, sources)];
  report(io, violations, json);
  return violations.length === 0 ? 0 : 1;
}
