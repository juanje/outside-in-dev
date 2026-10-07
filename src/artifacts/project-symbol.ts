import { dirname, join } from "node:path";
import ts from "typescript-api";
import { readText } from "./project-json.js";
import { isRelativeSpecifier } from "./source-roots.js";

export const COMPILER_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  noEmit: true,
  skipLibCheck: true,
  // Only the module's exports are read: the standard library is never needed, and loading it costs
  // about 200 ms and tens of megabytes on every call.
  noLib: true,
  types: [],
};

/** The project-relative path of the TypeScript file that a relative import specifier of `importer` names. */
export function moduleFileOf(importer: string, specifier: string): string {
  return join(dirname(importer), specifier.replace(/\.js$/, ".ts"));
}

/** The names the module file exports, re-exports included. */
export function exportedNames(moduleFile: string): string[] {
  const program = ts.createProgram([moduleFile], COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(program.getSourceFile(moduleFile)!);
  return symbol === undefined ? [] : checker.getExportsOfModule(symbol).map((exported) => exported.getName());
}

/** The module specifier of a static import that binds `name`. */
function staticImportOf(node: ts.Node, name: string): string | undefined {
  if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return undefined;
  const bindings = node.importClause?.namedBindings;
  const binds = bindings !== undefined && ts.isNamedImports(bindings) && bindings.elements.some((element) => (element.propertyName ?? element.name).text === name);
  return binds ? node.moduleSpecifier.text : undefined;
}

/** The specifier of `await import("<specifier>")`. */
function awaitedImportSpecifier(expression: ts.Expression): string | undefined {
  const call = ts.isAwaitExpression(expression) ? expression.expression : undefined;
  if (call === undefined || !ts.isCallExpression(call) || call.expression.kind !== ts.SyntaxKind.ImportKeyword) return undefined;
  const [argument] = call.arguments;
  return argument !== undefined && ts.isStringLiteral(argument) ? argument.text : undefined;
}

/** The module specifier of `const { name } = await import("<specifier>")`. */
function dynamicImportOf(node: ts.Node, name: string): string | undefined {
  if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name) || node.initializer === undefined) return undefined;
  const binds = node.name.elements.some((element) => (element.propertyName ?? element.name).getText() === name);
  return binds ? awaitedImportSpecifier(node.initializer) : undefined;
}

/** The module specifier a file imports `name` from, by a static import or by destructuring an awaited dynamic one. */
function importedFrom(node: ts.Node, name: string): string | undefined {
  return staticImportOf(node, name) ?? dynamicImportOf(node, name) ?? ts.forEachChild(node, (child) => importedFrom(child, name));
}

/** Whether `name`, imported by the test file from a project module, exists in that module: the project's real exports decide. */
export function resolveImportedSymbol(cwd: string, testFile: string, name: string): "exists" | "missing" | "external" {
  const testSource = ts.createSourceFile(testFile, readText(cwd, testFile)!, ts.ScriptTarget.ES2022, true);
  const specifier = importedFrom(testSource, name);
  if (specifier === undefined || !isRelativeSpecifier(specifier)) return "external";
  return exportedNames(join(cwd, moduleFileOf(testFile, specifier))).includes(name) ? "exists" : "missing";
}
