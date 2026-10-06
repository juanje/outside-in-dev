import { CATEGORY, type FindingDraft } from "./findings.js";

interface UnusedDiagnostic {
  code: number;
  start: number;
  length: number;
  message: string;
}

const NEVER_READ = new Set([6133, 6196]);
const ALL_IMPORTS_UNUSED = 6192;

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

/** The findings for the "declared but never read" diagnostics TypeScript reports for one file. */
export function unusedDeclarationFindings(file: string, text: string, diagnostics: UnusedDiagnostic[]): FindingDraft[] {
  return diagnostics.flatMap(({ code, start, length, message }): FindingDraft[] => {
    const range = { start: lineAt(text, start), end: lineAt(text, start + length) };
    if (code === ALL_IMPORTS_UNUSED) return [{ category: CATEGORY.deadCode, file, range, detail: "unused imports" }];
    if (!NEVER_READ.has(code)) return [];
    return [{ category: CATEGORY.deadCode, file, range, symbol: /'([^']+)'/.exec(message)?.[1], detail: "unused declaration" }];
  });
}
