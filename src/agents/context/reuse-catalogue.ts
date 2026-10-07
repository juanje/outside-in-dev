import { relative } from "node:path";
import { globSync } from "tinyglobby";
import ts from "typescript-api";
import { COMPILER_OPTIONS } from "../../artifacts/project-symbol.js";
import { firstLine, NEWLINE } from "../../artifacts/lines.js";
import { loadProjectConfig } from "../../artifacts/project-config.js";

const SPACE = " ";
const EXPORT_PREFIX = /^export\s+/;
const WHITESPACE = /\s+/g;

/** The text of a declaration from its start up to `end`, on one line and without `export`. */
function textUntil(declaration: ts.Node, end: number): string {
  return declaration.getText().slice(0, end - declaration.getStart()).replace(EXPORT_PREFIX, "").replace(WHITESPACE, SPACE).trim();
}

/** The signature of a constant or variable: its name and annotation, or an arrow function up to its body. */
function variableSignature(declaration: ts.VariableDeclaration): string {
  const { initializer } = declaration;
  const isConst = ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
  const kind = isConst ? "const" : "let";
  const isFunction = initializer !== undefined && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));
  const end = isFunction ? initializer.body.getStart() : (initializer?.getStart() ?? declaration.getEnd());
  return `${kind}${SPACE}${textUntil(declaration, end).replace(/\s*=$/, "")}`;
}

/** The signature of an exported declaration: its text up to its body, or all of a type, which has none. */
function signatureOf(declaration: ts.Declaration): string | undefined {
  if (ts.isFunctionDeclaration(declaration)) return textUntil(declaration, declaration.body?.getStart() ?? declaration.getEnd());
  if (ts.isClassDeclaration(declaration) || ts.isEnumDeclaration(declaration)) return textUntil(declaration, declaration.members.pos - 1);
  if (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) return textUntil(declaration, declaration.getEnd());
  return ts.isVariableDeclaration(declaration) ? variableSignature(declaration) : undefined;
}

/** The catalogue lines of the symbols a module exports. */
function entriesOf(file: ts.SourceFile, checker: ts.TypeChecker): string[] {
  const module = checker.getSymbolAtLocation(file);
  const exported = module === undefined ? [] : checker.getExportsOfModule(module);
  return exported.flatMap((symbol) => {
    const declaration = symbol.declarations?.[0];
    const signature = declaration && signatureOf(declaration);
    if (signature === undefined) return [];
    const doc = firstLine(ts.displayPartsToString(symbol.getDocumentationComment(checker)));
    return [`- \`${signature}\` ${doc}`];
  });
}

/** The reuse catalogue of a project: every exported symbol of its source, grouped by module, with its signature and the first line of its JSDoc; never a body. */
export function reuseCatalogue(cwd: string): string {
  const files = globSync(loadProjectConfig(cwd).paths.source, { cwd, absolute: true }).sort();
  const program = ts.createProgram(files, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  return files
    .flatMap((path) => {
      const entries = entriesOf(program.getSourceFile(path)!, checker);
      return entries.length === 0 ? [] : [`## ${relative(cwd, path)}`, ...entries, ""];
    })
    .join(NEWLINE);
}
