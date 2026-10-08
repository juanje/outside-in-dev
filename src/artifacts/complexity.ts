import ts from "typescript-api";

/** The name the analysed text is given, which no finding shows. */
const SOURCE_NAME = "source.ts";

export interface ComplexityLimits {
  max_cyclomatic: number;
  max_depth: number;
}

interface ComplexFunction {
  symbol: string;
  start: number;
  end: number;
  detail: string;
}

const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function isDecisionPoint(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isIterationStatement(node, false) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node) ||
    (ts.isBinaryExpression(node) && LOGICAL_OPERATORS.has(node.operatorToken.kind))
  );
}

function isElseIf(node: ts.Node): boolean {
  return ts.isIfStatement(node) && ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
}

function isNestingBlock(node: ts.Node): boolean {
  return (
    (ts.isIfStatement(node) && !isElseIf(node)) ||
    ts.isIterationStatement(node, false) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node)
  );
}

function measure(body: ts.Node): { cyclomatic: number; depth: number } {
  let points = 0;
  let deepest = 0;
  const visit = (node: ts.Node, depth: number): void => {
    const nested = isNestingBlock(node) ? depth + 1 : depth;
    if (isDecisionPoint(node)) points++;
    deepest = Math.max(deepest, nested);
    ts.forEachChild(node, (child) => {
      if (!ts.isFunctionLike(child)) visit(child, nested);
    });
  };
  visit(body, 0);
  return { cyclomatic: 1 + points, depth: deepest };
}

type FunctionWithBody = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression;

export function isFunctionWithBody(node: ts.Node): node is FunctionWithBody & { body: ts.Node } {
  return (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    node.body !== undefined
  );
}

const ANONYMOUS = "<anonymous>";

export function symbolOf(node: FunctionWithBody): string {
  if (ts.isMethodDeclaration(node)) {
    const owner = ts.isClassLike(node.parent) && node.parent.name ? `${node.parent.name.text}.` : "";
    return `${owner}${node.name.getText()}`;
  }
  if (node.name) return node.name.text;
  const { parent } = node;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : ANONYMOUS;
}

/** The functions of a source text whose cyclomatic complexity or nesting depth is above the limits. */
export function findComplexFunctions(text: string, limits: ComplexityLimits): ComplexFunction[] {
  const file = ts.createSourceFile(SOURCE_NAME, text, ts.ScriptTarget.Latest, true);
  const found: ComplexFunction[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionWithBody(node)) {
      const { cyclomatic, depth } = measure(node.body);
      const exceeded = [
        cyclomatic > limits.max_cyclomatic ? `cyclomatic complexity ${cyclomatic} > ${limits.max_cyclomatic}` : "",
        depth > limits.max_depth ? `nesting depth ${depth} > ${limits.max_depth}` : "",
      ].filter((detail) => detail !== "");
      if (exceeded.length > 0) {
        found.push({
          symbol: symbolOf(node),
          start: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          end: file.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
          detail: exceeded.join("; "),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The functions with a body in a source text, with the cyclomatic complexity of each, in source order. */
function functionComplexities(text: string): { symbol: string; cyclomatic: number }[] {
  const file = ts.createSourceFile(SOURCE_NAME, text, ts.ScriptTarget.Latest, true);
  const found: { symbol: string; cyclomatic: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionWithBody(node)) found.push({ symbol: symbolOf(node), cyclomatic: measure(node.body).cyclomatic });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The names of the functions with a body in a source text. */
export function functionNames(text: string): Set<string> {
  return new Set(functionComplexities(text).map(({ symbol }) => symbol));
}

/** The sum of the cyclomatic complexity of the functions of a source text; when `names` is given, only of the functions with those names. */
export function totalComplexity(text: string, names?: Set<string>): number {
  return functionComplexities(text)
    .filter(({ symbol }) => names === undefined || names.has(symbol))
    .reduce((total, { cyclomatic }) => total + cyclomatic, 0);
}
