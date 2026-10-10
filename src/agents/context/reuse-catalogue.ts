import { basename, dirname, extname, relative } from "node:path";
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

/** The size, in characters, of the part of the catalogue that has signatures; the modules beyond it are listed by path. */
const CATALOGUE_BUDGET = 30_000;

/** What a task tells about itself so that the catalogue starts with what it needs: the modules it uses, its text, and the budget if it is not the usual one. */
export type CatalogueTask = { used?: string[]; mentions?: string; budget?: number };

/** The shortest module name that the text of a task can mention by name. */
const MIN_NAME_LENGTH = 4;

const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const NOT_WORD = /[^a-z0-9]+/gi;

/** The words of a text or of a module name, lower-cased and apart by one space, with the camel-case words cut: `cart-lines` and `cartLines` are both `cart lines`. */
function wordsOf(text: string): string {
  return `${SPACE}${text.replace(CAMEL_BOUNDARY, "$1 $2").replace(NOT_WORD, SPACE).toLowerCase().trim()}${SPACE}`;
}

/** How near a module is to a task, the nearest first: one it uses, one in the folder of one it uses, one whose name it mentions, any other. */
function rank(path: string, task: CatalogueTask): number {
  const used = task.used ?? [];
  const name = basename(path, extname(path));
  const nearness = [used.includes(path), used.some((other) => dirname(other) === dirname(path)), name.length >= MIN_NAME_LENGTH && wordsOf(task.mentions ?? "").includes(wordsOf(name)), true];
  return nearness.indexOf(true);
}

/** The heading of the modules whose signatures do not fit in the budget. */
const OTHER_MODULES_HEADING = "Other modules (signatures not shown, read the file when you need it):";

/** The reuse catalogue of a project: the exported symbols of its source, grouped by module, with the signature and the first line of the JSDoc of each and never a body, as far as the budget allows; the modules of the task come first, and the others that do not fit are listed by path. */
export function reuseCatalogue(cwd: string, task: CatalogueTask = {}): string {
  const files = globSync(loadProjectConfig(cwd).paths.source, { cwd, absolute: true }).sort();
  const program = ts.createProgram(files, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const sections = files
    .map((path) => ({ path: relative(cwd, path), entries: entriesOf(program.getSourceFile(path)!, checker) }))
    .filter(({ entries }) => entries.length > 0)
    .map(({ path, entries }) => ({ path, text: [`## ${path}`, ...entries, ""].join(NEWLINE) }))
    .sort((a, b) => rank(a.path, task) - rank(b.path, task));
  let size = 0;
  const shown = sections.filter(({ text }) => (size + text.length <= (task.budget ?? CATALOGUE_BUDGET) ? ((size += text.length), true) : false));
  const left = sections.filter((section) => !shown.includes(section));
  return [...shown.map(({ text }) => text), ...(left.length === 0 ? [] : [OTHER_MODULES_HEADING, ...left.map(({ path }) => `- ${path}`).sort(), ""])].join(NEWLINE);
}
