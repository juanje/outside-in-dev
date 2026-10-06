import ts from "typescript-api";
import { isFunctionWithBody, symbolOf } from "./complexity.js";

interface JsdocDrift {
  start: number;
  end: number;
  symbol: string;
  detail: string;
}

/** The JSDoc of a source text that does not match the signature it documents: a `@param` that names no parameter, or a parameter a JSDoc that documents parameters leaves out (a destructured parameter is matched by the root name the JSDoc uses). */
export function findJsdocDrift(text: string): JsdocDrift[] {
  const file = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const found: JsdocDrift[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionWithBody(node)) {
      const named = node.parameters.flatMap((parameter) => (ts.isIdentifier(parameter.name) ? [parameter.name.text] : []));
      const destructured = node.parameters.length - named.length;
      for (const doc of ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc)) {
        const range = {
          start: file.getLineAndCharacterOfPosition(doc.getStart()).line + 1,
          end: file.getLineAndCharacterOfPosition(doc.getEnd()).line + 1,
        };
        const documented = [...new Set(ts.getAllJSDocTags(node, ts.isJSDocParameterTag).map((tag) => tag.name.getText().split(".")[0]!))];
        const details = [
          ...documented.filter((name) => !named.includes(name)).slice(destructured).map((name) => `@param ${name} matches no parameter`),
          ...(documented.length > 0 ? named.filter((name) => !documented.includes(name)).map((name) => `parameter ${name} is not documented`) : []),
        ];
        for (const detail of details) found.push({ ...range, symbol: symbolOf(node), detail });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

interface StaleReference {
  line: number;
  detail: string;
}

const CODE_SPAN = /`([^`]+)`/g;
const CALL_SHAPE = /^([A-Za-z_$][\w$]*)\(\)$/;
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/;
const SOURCE_PATH = /^[\w./-]+\.(?:ts|js|mts)$/;

/** What is wrong with an inline code span that names code, or undefined when it is fine or names nothing. */
function staleDetail(span: string, declared: Set<string>, exists: (path: string) => boolean): string | undefined {
  if (SOURCE_PATH.test(span)) return exists(span) ? undefined : `\`${span}\` does not exist`;
  const name = CALL_SHAPE.exec(span)?.[1] ?? (PASCAL_CASE.test(span) ? span : undefined);
  return name !== undefined && !declared.has(name) ? `\`${span}\` is not declared in source` : undefined;
}

const FENCE = /^\s*(?:```|~~~)/;

/** The inline code spans of a Markdown text that name code that does not exist: a call or a PascalCase name that no declaration names, a source path without a file. Fenced blocks are not checked. */
export function findStaleReferences(markdown: string, declared: Set<string>, exists: (path: string) => boolean): StaleReference[] {
  let fenced = false;
  return markdown.split("\n").flatMap((text, index) => {
    const isFence = FENCE.test(text);
    if (isFence) fenced = !fenced;
    if (fenced || isFence) return [];
    return [...text.matchAll(CODE_SPAN)].flatMap(([, span]) => {
      const detail = staleDetail(span!, declared, exists);
      return detail === undefined ? [] : [{ line: index + 1, detail }];
    });
  });
}

function isDeclaration(
  node: ts.Node,
): node is ts.FunctionDeclaration | ts.ClassDeclaration | ts.MethodDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration | ts.VariableDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isVariableDeclaration(node)
  );
}

/** The names a source text declares: functions, classes, methods, interfaces, types, enums and variables. */
export function declaredNames(text: string): Set<string> {
  const file = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (isDeclaration(node) && node.name && ts.isIdentifier(node.name)) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}
