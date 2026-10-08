import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadProjectPaths, type ProjectPaths } from "../artifacts/project-paths.js";
import { parseRequirements, validateSpec } from "../artifacts/spec.js";
import { checkProgressConsistency } from "../artifacts/consistency.js";
import { loadProgress, ProgressError } from "../artifacts/progress.js";
import { checkTraceability, listScenarios, readFeatureSources } from "../artifacts/traceability.js";
import type { CliIo } from "../cli-io.js";

export type Violation = { check: "config" | "spec" | "traceability" | "progress"; message: string };

function reportJson(io: CliIo, violations: Violation[]): void {
  io.stdout(`${JSON.stringify({ ok: violations.length === 0, violations })}\n`);
}

type Source = ReturnType<typeof readFeatureSources>[number];

function checkSpecFile(cwd: string, paths: ProjectPaths): { text: string; violations: Violation[] } {
  const specPath = join(cwd, paths.spec);
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

function checkProgressFile(cwd: string, paths: ProjectPaths, sources: Source[]): Violation[] {
  if (!existsSync(join(cwd, paths.progress))) return [];
  try {
    const progress = loadProgress(cwd, paths.progress);
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

/** The violations of the project in `cwd`, as `oid check` reports them: the spec, the traceability of the feature files and the consistency of the progress file. */
function violationsOf(cwd: string, paths: ProjectPaths): Violation[] {
  const spec = checkSpecFile(cwd, paths);
  const sources = readFeatureSources(cwd, paths.features);
  const knownIds = parseRequirements(spec.text).map((requirement) => requirement.id);
  return [...spec.violations, ...checkFeatureTags(sources, knownIds), ...checkProgressFile(cwd, paths, sources)];
}

/** The violations `oid check` reports for the project in `cwd`; throws when the configuration is invalid. */
export function checkViolations(cwd: string): Violation[] {
  return violationsOf(cwd, loadProjectPaths(cwd));
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
  const violations = violationsOf(io.cwd, paths);
  report(io, violations, json);
  return violations.length === 0 ? 0 : 1;
}
