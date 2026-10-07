import ts from "typescript-api";
import { readText } from "../../artifacts/project-json.js";
import { moduleFileOf } from "../../artifacts/project-symbol.js";
import { isInsideSource, isRelativeSpecifier } from "../../artifacts/source-roots.js";

/** The project files that `file` imports by a relative path and that exist. */
function relativeImports(cwd: string, file: string): string[] {
  const text = readText(cwd, file) ?? "";
  return ts
    .preProcessFile(text, true, true)
    .importedFiles.map(({ fileName }) => fileName)
    .filter(isRelativeSpecifier)
    .map((specifier) => moduleFileOf(file, specifier))
    .filter((imported) => readText(cwd, imported) !== undefined);
}

/** The files of the source paths that `files` import, directly or through each other, following relative imports only. */
export function importClosure(cwd: string, files: string[], sourceGlobs: string[]): string[] {
  const found = new Set<string>();
  const pending = [...files];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    for (const imported of relativeImports(cwd, file)) {
      if (!isInsideSource(sourceGlobs, imported) || found.has(imported)) continue;
      found.add(imported);
      pending.push(imported);
    }
  }
  return [...found];
}
