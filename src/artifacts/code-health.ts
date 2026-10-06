import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { globSync } from "tinyglobby";
import ts from "typescript-api";
import { duplicationFindings } from "./duplication.js";
import { findComplexFunctions, type ComplexityLimits } from "./complexity.js";
import type { FindingDraft } from "./findings.js";
import { ProgressError } from "./progress.js";
import { readJson, TSCONFIG_FILE } from "./project-json.js";
import type { DuplicationLimits } from "./project-config.js";
import type { ProjectPaths } from "./project-paths.js";

/** The files tsconfig.json compiles (the file must exist), relative to the project and with `/` separators. */
function compiledFiles(cwd: string): Set<string> {
  const tsconfig = readJson(cwd, TSCONFIG_FILE);
  if (tsconfig === undefined) throw new ProgressError(`${TSCONFIG_FILE} not found`);
  const { fileNames } = ts.parseJsonConfigFileContent(tsconfig as object, ts.sys, cwd);
  return new Set(fileNames.map((name) => relative(cwd, name).split(sep).join("/")));
}

/** The files that tsconfig.json compiles and that match `globs` and not `ignore`. */
function compiledMatching(cwd: string, globs: string[], ignore: string[] = []): string[] {
  const compiled = compiledFiles(cwd);
  return globSync(globs, { cwd, ignore }).filter((file) => compiled.has(file));
}

/** The functions of the project's source files that are too complex, for the limits given. */
export function detectComplexity(cwd: string, paths: ProjectPaths, limits: ComplexityLimits): FindingDraft[] {
  return compiledMatching(cwd, paths.source, paths.tests).flatMap((file) =>
    findComplexFunctions(readFileSync(join(cwd, file), "utf8"), limits).map(({ symbol, start, end, detail }) => ({
      category: "complexity" as const,
      file,
      range: { start, end },
      symbol,
      detail,
    })),
  );
}

const JSCPD_BIN = createRequire(import.meta.url).resolve("jscpd/run-jscpd.js");
const JSCPD_REPORT = "jscpd-report.json";

/** The blocks that appear twice in the project's source and test files, found by jscpd run from oid's own dependencies. */
export function detectDuplication(cwd: string, paths: ProjectPaths, limits: DuplicationLimits): FindingDraft[] {
  const files = compiledMatching(cwd, [...paths.source, ...paths.tests]);
  if (files.length === 0) return [];
  const outputDir = mkdtempSync(join(tmpdir(), "oid-jscpd-"));
  try {
    const config = join(outputDir, "config.json");
    const settings = { minLines: limits.min_lines, minTokens: limits.min_tokens, reporters: ["json"], output: outputDir, silent: true };
    writeFileSync(config, JSON.stringify(settings));
    const run = spawnSync(process.execPath, [JSCPD_BIN, "--absolute", "--config", config, ...files], { cwd, encoding: "utf8" });
    if (run.status !== 0) throw new ProgressError(`jscpd failed: ${run.stderr}`);
    return duplicationFindings(JSON.parse(readFileSync(join(outputDir, JSCPD_REPORT), "utf8")), cwd);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}
