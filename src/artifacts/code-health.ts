import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { globSync } from "tinyglobby";
import ts from "typescript-api";
import { findCommentedOutCode } from "./commented-out-code.js";
import { knipConfig, knipFindings } from "./dead-code.js";
import { duplicationFindings } from "./duplication.js";
import { unusedDeclarationFindings } from "./unused-declarations.js";
import { findComplexFunctions, type ComplexityLimits } from "./complexity.js";
import type { FindingDraft } from "./findings.js";
import { ProgressError } from "./progress.js";
import { readJson, readText, TSCONFIG_FILE } from "./project-json.js";
import type { DuplicationLimits } from "./project-config.js";
import type { ProjectPaths } from "./project-paths.js";

/** The compiler options and files of the project's tsconfig.json (the file must exist). */
function parsedTsconfig(cwd: string): ts.ParsedCommandLine {
  const tsconfig = readJson(cwd, TSCONFIG_FILE);
  if (tsconfig === undefined) throw new ProgressError(`${TSCONFIG_FILE} not found`);
  return ts.parseJsonConfigFileContent(tsconfig as object, ts.sys, cwd);
}

/** The files tsconfig.json compiles, relative to the project and with `/` separators. */
function compiledFiles(cwd: string): Set<string> {
  const { fileNames } = parsedTsconfig(cwd);
  return new Set(fileNames.map((name) => relative(cwd, name).split(sep).join("/")));
}

/** The files that tsconfig.json compiles and that match `globs` and not `ignore`. */
function compiledMatching(cwd: string, globs: string[], ignore: string[] = []): string[] {
  const compiled = compiledFiles(cwd);
  return globSync(globs, { cwd, ignore }).filter((file) => compiled.has(file));
}

/** The compiled source and test files of the project. */
function sourceAndTestFiles(cwd: string, paths: ProjectPaths): string[] {
  return compiledMatching(cwd, [...paths.source, ...paths.tests]);
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
  const files = sourceAndTestFiles(cwd, paths);
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

/** knip does not export its bin, so it is found from its main module (`dist/index.js`). */
const KNIP_BIN = join(dirname(createRequire(import.meta.url).resolve("knip")), "..", "bin", "knip.js");
const KNIP_FOUND_ISSUES = 1;
const PACKAGE_FILE = "package.json";

/** The unused files, exports and dependencies of the project, found by knip run from oid's own dependencies. */
export function detectUnusedCode(cwd: string, paths: ProjectPaths, entry: string[]): FindingDraft[] {
  const packageJson = readText(cwd, PACKAGE_FILE);
  if (packageJson === undefined) return [];
  const configDir = mkdtempSync(join(tmpdir(), "oid-knip-"));
  try {
    const config = join(configDir, "knip.json");
    writeFileSync(config, JSON.stringify(knipConfig(paths, entry)));
    const run = spawnSync(process.execPath, [KNIP_BIN, "--config", config, "--reporter", "json", "--no-progress"], { cwd, encoding: "utf8" });
    if (run.status !== 0 && run.status !== KNIP_FOUND_ISSUES) throw new ProgressError(`knip failed: ${run.stdout}${run.stderr}`);
    return knipFindings(JSON.parse(run.stdout), packageJson);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

/** The unused locals, parameters and imports of the project's source and test files, from the diagnostics of the analysis engine with `noUnusedLocals` and `noUnusedParameters` forced on. */
export function detectUnusedDeclarations(cwd: string, paths: ProjectPaths): FindingDraft[] {
  const { fileNames, options } = parsedTsconfig(cwd);
  const program = ts.createProgram(fileNames, { ...options, noUnusedLocals: true, noUnusedParameters: true, noEmit: true });
  return sourceAndTestFiles(cwd, paths).flatMap((file) => {
    const sourceFile = program.getSourceFile(join(cwd, file));
    if (sourceFile === undefined) return [];
    const diagnostics = program
      .getSemanticDiagnostics(sourceFile)
      .flatMap(({ code, start, length, messageText }) =>
        start === undefined || length === undefined ? [] : [{ code, start, length, message: ts.flattenDiagnosticMessageText(messageText, "\n") }],
      );
    return unusedDeclarationFindings(file, sourceFile.text, diagnostics);
  });
}

/** The commented-out code of the project's source and test files. */
export function detectCommentedOutCode(cwd: string, paths: ProjectPaths): FindingDraft[] {
  return sourceAndTestFiles(cwd, paths).flatMap((file) =>
    findCommentedOutCode(readFileSync(join(cwd, file), "utf8")).map((range) => ({ category: "dead_code" as const, file, range, detail: "commented-out code" })),
  );
}
