import { dirname, join, normalize } from "node:path";
import ts from "typescript-api";

const READ_FILE = "readFileSync";
const PATH_CHARACTER = /[/.]/;

/** The name a call is made by: `f` of `f(...)` and `m` of `x.m(...)`. */
function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

/** The value of each name declared with a string literal: `const NAME = "..."`. */
function stringConstants(source: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && ts.isStringLiteralLike(node.initializer)) {
      constants.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return constants;
}

/** The text of every string literal inside `node`, with the value of each constant it names. */
function literalsIn(node: ts.Node, constants: Map<string, string>): string[] {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isIdentifier(node) && constants.has(node.text)) return [constants.get(node.text)!];
  const found: string[] = [];
  ts.forEachChild(node, (child) => {
    found.push(...literalsIn(child, constants));
  });
  return found;
}

/** The lines of the `readFileSync` calls of `text`, a file of the project at `file`, that read a path under the source directories: any string in the call, taken from the file's directory or from the project's, that is one. */
export function sourceReadLines(text: string, file: string, isSource: (path: string) => boolean): number[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const constants = stringConstants(source);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calleeName(node) === READ_FILE) {
      const paths = literalsIn(node, constants).filter((literal) => PATH_CHARACTER.test(literal));
      if (paths.some((path) => isSource(normalize(join(dirname(file), path))) || isSource(normalize(path)))) {
        lines.push(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}
