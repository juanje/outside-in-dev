import { existsSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript-api";
import { changedSinceCheckpoint } from "./checkpoint.js";
import { focusedFeature } from "./verified-checkpoint.js";
import type { ProjectConfig } from "./project-config.js";
import { readText } from "./project-json.js";
import { exportedNames, moduleFileOf } from "./project-symbol.js";
import { isInsideSource, isRelativeSpecifier } from "./source-roots.js";

const TYPESCRIPT_EXTENSION = ".ts";

/** A name that a file imports statically from a module that, or an export that, does not exist yet. */
export interface MissingImport {
  file: string;
  line: number;
  /** The name imported; absent for a namespace or side-effect import, which only needs the module. */
  name?: string;
  specifier: string;
}

const DEFAULT_EXPORT = "default";

/** The names a static import declaration needs from its module: `default` for a default import, each named binding by the name it imports, and `undefined` (the module alone) for a namespace or side-effect import. */
function importedNames(clause: ts.ImportClause | undefined): (string | undefined)[] {
  const bindings = clause?.namedBindings;
  if (clause === undefined || (bindings !== undefined && ts.isNamespaceImport(bindings))) return [undefined];
  const names = clause.name === undefined ? [] : [DEFAULT_EXPORT];
  return bindings !== undefined && ts.isNamedImports(bindings) ? [...names, ...bindings.elements.map((element) => (element.propertyName ?? element.name).text)] : names;
}

/** The static imports from relative specifiers: each name they bind with its line and the specifier. */
function namedImports(source: ts.SourceFile): { line: number; name?: string; specifier: string }[] {
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !isRelativeSpecifier(statement.moduleSpecifier.text)) return [];
    const line = source.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
    const specifier = statement.moduleSpecifier.text;
    return importedNames(statement.importClause).map((name) => (name === undefined ? { line, specifier } : { line, name, specifier }));
  });
}

/** The static imports of a step or support file, from modules under the source directories, that do not exist yet. */
export function missingStaticImports(cwd: string, file: string, isSource: (path: string) => boolean): MissingImport[] {
  const source = ts.createSourceFile(file, readText(cwd, file)!, ts.ScriptTarget.ES2022, true);
  return namedImports(source)
    .filter(({ name, specifier }) => {
      const moduleFile = moduleFileOf(file, specifier);
      if (!isSource(moduleFile)) return false;
      return !existsSync(join(cwd, moduleFile)) || (name !== undefined && !exportedNames(join(cwd, moduleFile)).includes(name));
    })
    .map((found) => ({ file, ...found }));
}

/** What to do about an import that cannot load: it must be a dynamic import inside the step. */
const DYNAMIC_ADVICE = "which does not exist yet: import it dynamically inside the step";

/** One line for each static import, in the step and support files that changed since the checkpoint of the feature in focus, of something under `paths.source` that does not exist yet; cucumber could not start with it. */
export function loadableStepsProblems(cwd: string, config: ProjectConfig): string[] {
  const isSource = (path: string): boolean => isInsideSource(config.paths.source, path);
  return changedSinceCheckpoint(cwd, focusedFeature(cwd, config))
    .filter((file) => file.endsWith(TYPESCRIPT_EXTENSION) && isInsideSource(config.paths.bdd_steps, file) && existsSync(join(cwd, file)))
    .flatMap((file) => missingStaticImports(cwd, file, isSource))
    .map(({ file, line, name, specifier }) => `${file}:${line} imports ${name === undefined ? "" : `${name} from `}"${specifier}", ${DYNAMIC_ADVICE}`);
}
