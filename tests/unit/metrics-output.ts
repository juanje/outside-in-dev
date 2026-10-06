/** The lines of `oid metrics` output that report one finding of `category` (not its summary count). */
export function findingLines(stdout: string, category: string): string[] {
  const finding = new RegExp(`^${category} \\S+:\\d+-\\d+ `);
  return stdout.split("\n").filter((line) => finding.test(line));
}

/** The count the summary line of `oid metrics` gives for `category`, or 0 when it does not list it. */
export function summaryCount(stdout: string, category: string): number {
  const entry = new RegExp(`^(?:.*, )?${category} (\\d+)(?:,.*)?$`);
  for (const line of stdout.split("\n")) {
    const match = entry.exec(line);
    if (match) return Number(match[1]);
  }
  return 0;
}
