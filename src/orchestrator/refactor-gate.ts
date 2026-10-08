import { functionNames, totalComplexity } from "../artifacts/complexity.js";
import { findingKey } from "../artifacts/baseline.js";
import { type FindingDraft, formatFinding } from "../artifacts/findings.js";

/** The names of the functions a file has before and after a refactor. */
function kept({ before, after }: { before: string; after: string }): Set<string> {
  const now = functionNames(after);
  return new Set([...functionNames(before)].filter((name) => now.has(name)));
}

/** What is wrong with the findings after a refactor: a listed finding that is still there, wherever its lines moved, and a finding that was not there before. */
export function findingProblems(listed: FindingDraft[], before: FindingDraft[], after: FindingDraft[]): string[] {
  const listedKeys = new Set(listed.map(findingKey));
  const beforeKeys = new Set(before.map(findingKey));
  return after.flatMap((draft) => {
    const key = findingKey(draft);
    if (listedKeys.has(key)) return [`the finding is still there: ${formatFinding(draft)}`];
    return beforeKeys.has(key) ? [] : [`a new finding: ${formatFinding(draft)}`];
  });
}

/** Why the files a refactor touched are worse than they were: the total cyclomatic complexity of the functions they had before, and still have, grew. A function the refactor adds or removes is not counted. Nothing when it did not grow. */
export function complexityProblem(files: { before: string; after: string }[]): string | undefined {
  const sum = (side: "before" | "after"): number => files.reduce((total, file) => total + totalComplexity(file[side], kept(file)), 0);
  const [before, after] = [sum("before"), sum("after")];
  return after > before ? `the code is more complex than before (${before} -> ${after})` : undefined;
}
