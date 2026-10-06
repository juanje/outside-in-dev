import { dirname, join } from "node:path";
import ts from "typescript-api";
import { readText } from "./project-json.js";
import { isRelativeSpecifier } from "./source-roots.js";

const COMPILER_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  noEmit: true,
  skipLibCheck: true,
  types: [],
};

/** The names the module file exports, re-exports included. */
function exportedNames(moduleFile: string): string[] {
  const program = ts.createProgram([moduleFile], COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(program.getSourceFile(moduleFile)!);
  return symbol === undefined ? [] : checker.getExportsOfModule(symbol).map((exported) => exported.getName());
}

/** The module specifier a test file imports `name` from, if it imports it by name. */
function importedFrom(testSource: ts.SourceFile, name: string): string | undefined {
  for (const statement of testSource.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    if (bindings.elements.some((element) => (element.propertyName ?? element.name).text === name)) return statement.moduleSpecifier.text;
  }
  return undefined;
}

/** Whether `name`, imported by the test file from a project module, exists in that module: the project's real exports decide. */
export function resolveImportedSymbol(cwd: string, testFile: string, name: string): "exists" | "missing" | "external" {
  const testSource = ts.createSourceFile(testFile, readText(cwd, testFile)!, ts.ScriptTarget.ES2022);
  const specifier = importedFrom(testSource, name);
  if (specifier === undefined || !isRelativeSpecifier(specifier)) return "external";
  const moduleFile = join(cwd, dirname(testFile), specifier.replace(/\.js$/, ".ts"));
  return exportedNames(moduleFile).includes(name) ? "exists" : "missing";
}
