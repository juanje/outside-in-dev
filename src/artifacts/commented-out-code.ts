import ts from "typescript-api";

const MIN_LINES = 2;
const DIRECTIVE = /^\s*(@ts-|eslint-)/m;
const MARKER_LENGTH = 2;
const JSDOC_MARK = "*";

interface Comment {
  start: number;
  end: number;
  text: string;
  block: boolean;
}

/** The comments of the file other than JSDoc blocks, in order, each with its 1-based first and last line and its text without the markers. */
function comments(sourceFile: ts.SourceFile): Comment[] {
  const found = new Map<number, Comment>();
  const collect = (ranges: ts.CommentRange[] | undefined): void => {
    for (const { kind, pos, end } of ranges ?? []) {
      const block = kind === ts.SyntaxKind.MultiLineCommentTrivia;
      const text = sourceFile.text.slice(pos + MARKER_LENGTH, block ? end - MARKER_LENGTH : end);
      const line = (offset: number): number => sourceFile.getLineAndCharacterOfPosition(offset).line + 1;
      if (block && text.startsWith(JSDOC_MARK)) continue;
      found.set(pos, { start: line(pos), end: line(end), text, block });
    }
  };
  const visit = (node: ts.Node): void => {
    collect(ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()));
    collect(ts.getTrailingCommentRanges(sourceFile.text, node.getEnd()));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...found.values()].sort((a, b) => a.start - b.start);
}

/** A lone identifier, or a label in front of one: what a short sentence such as "TODO: fix" parses as. */
function looksLikeProse(statement: ts.Statement): boolean {
  if (ts.isLabeledStatement(statement)) return looksLikeProse(statement.statement);
  return ts.isExpressionStatement(statement) && ts.isIdentifier(statement.expression);
}

function isCode(code: string): boolean {
  if (DIRECTIVE.test(code)) return false;
  const { diagnostics } = ts.transpileModule(code, { reportDiagnostics: true });
  if (diagnostics?.length !== 0) return false;
  return !ts.createSourceFile("comment.ts", code, ts.ScriptTarget.Latest).statements.every(looksLikeProse);
}

/** The runs of line comments on consecutive lines, and each block comment on its own. */
function runs(all: Comment[]): Comment[] {
  const found: Comment[] = [];
  for (const comment of all) {
    const run = found.at(-1);
    if (run !== undefined && !run.block && !comment.block && run.end + 1 === comment.start) {
      found[found.length - 1] = { ...run, end: comment.end, text: `${run.text}\n${comment.text}` };
    } else found.push(comment);
  }
  return found;
}

/** The line ranges of the comments that are code. */
export function findCommentedOutCode(text: string): { start: number; end: number }[] {
  const sourceFile = ts.createSourceFile("file.ts", text, ts.ScriptTarget.Latest);
  return runs(comments(sourceFile))
    .filter((run) => run.end - run.start + 1 >= MIN_LINES && isCode(run.text))
    .map(({ start, end }) => ({ start, end }));
}
