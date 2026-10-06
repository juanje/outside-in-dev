import ts from "typescript-api";
import { compareText, type FindingDraft } from "./findings.js";

interface LineRange {
  start: number;
  end: number;
}

interface MagicValue extends LineRange {
  detail: string;
}

/** The 1-based first and last line of a node. */
function linesOf(file: ts.SourceFile, node: ts.Node): LineRange {
  return {
    start: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    end: file.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

/** The text of a numeric literal, with its minus sign when it has one; undefined for any other node. */
function numberOf(node: ts.Node): string | undefined {
  if (ts.isNumericLiteral(node)) return node.text;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return `-${node.operand.text}`;
  }
  return undefined;
}

/** Whether the node is the value a `const` declaration or an enum member gives its name: that is the named constant. */
function isNamedConstant(node: ts.Node): boolean {
  const { parent } = node;
  if (ts.isEnumMember(parent)) return parent.initializer === node;
  return ts.isVariableDeclaration(parent) && parent.initializer === node && (parent.parent.flags & ts.NodeFlags.Const) !== 0;
}

/** Whether the string only names something: the module of an import or export declaration, or the key of an object property. */
function isName(node: ts.Node): boolean {
  const { parent } = node;
  return ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || (ts.isPropertyAssignment(parent) && parent.name === node);
}

/** The numeric literals of a source text that are not in `ignored`. */
export function findMagicNumbers(text: string, ignored: number[]): MagicValue[] {
  const file = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const found: MagicValue[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isLiteralTypeNode(node)) return;
    const number = numberOf(node);
    if (number === undefined) {
      ts.forEachChild(node, visit);
    } else if (!ignored.includes(Number(number)) && !isNamedConstant(node)) {
      found.push({ ...linesOf(file, node), detail: `magic number ${number}` });
    }
  };
  visit(file);
  return found;
}

interface Occurrence {
  file: string;
  range: LineRange;
}

/** The string literals of a source text, with the lines they span. */
function stringsOf(text: string): (LineRange & { value: string })[] {
  const file = ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
  const found: (LineRange & { value: string })[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isLiteralTypeNode(node)) return;
    if (ts.isStringLiteral(node) && node.text !== "" && !isName(node) && !isNamedConstant(node)) found.push({ value: node.text, ...linesOf(file, node) });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The strings that appear at least `minRepeats` times in the files: one finding each, at the first occurrence, the others related. */
export function findRepeatedStrings(files: { file: string; text: string }[], minRepeats: number): FindingDraft[] {
  const occurrences = new Map<string, Occurrence[]>();
  const ordered = [...files].sort((a, b) => compareText(a.file, b.file));
  for (const { file, text } of ordered) {
    for (const { value, start, end } of stringsOf(text)) {
      occurrences.set(value, [...(occurrences.get(value) ?? []), { file, range: { start, end } }]);
    }
  }
  return [...occurrences]
    .filter(([, all]) => all.length >= minRepeats)
    .map(([value, [first, ...others]]) => ({
      category: "magic_value" as const,
      ...first!,
      detail: `string "${value}" repeated ${others.length + 1} times`,
      related: others,
    }));
}
