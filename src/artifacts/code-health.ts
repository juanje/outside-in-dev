import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { globSync } from "tinyglobby";
import ts from "typescript-api";
import { findComplexFunctions, type ComplexityLimits } from "./complexity.js";
import type { FindingDraft } from "./findings.js";
import { ProgressError } from "./progress.js";
import { readJson, TSCONFIG_FILE } from "./project-json.js";
import type { ProjectPaths } from "./project-paths.js";

/** The files tsconfig.json compiles (the file must exist), relative to the project and with `/` separators. */
function compiledFiles(cwd: string): Set<string> {
  const tsconfig = readJson(cwd, TSCONFIG_FILE);
  if (tsconfig === undefined) throw new ProgressError(`${TSCONFIG_FILE} not found`);
  const { fileNames } = ts.parseJsonConfigFileContent(tsconfig as object, ts.sys, cwd);
  return new Set(fileNames.map((name) => relative(cwd, name).split(sep).join("/")));
}

/** The functions of the project's source files that are too complex, for the limits given. */
export function detectComplexity(cwd: string, paths: ProjectPaths, limits: ComplexityLimits): FindingDraft[] {
  const compiled = compiledFiles(cwd);
  const files = globSync(paths.source, { cwd, ignore: paths.tests }).filter((file) => compiled.has(file));
  return files.flatMap((file) =>
    findComplexFunctions(readFileSync(join(cwd, file), "utf8"), limits).map(({ symbol, start, end, detail }) => ({
      category: "complexity" as const,
      file,
      range: { start, end },
      symbol,
      detail,
    })),
  );
}
