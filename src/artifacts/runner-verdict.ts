/** The names of the two suites in the problems a run or a Green lists. */
export const SUITE = { unit: "unit", bdd: "bdd" } as const;

/** What each suite reports as failed, as the problem of an exit that its report does not explain names it. */
export const FAILING = { unit: "failing test", bdd: "failing scenario" } as const;

/** The problem of a runner that did not write the report oid reads. */
export function noReport(kind: string, exitCode: number | null): string {
  return `${kind}: the runner wrote no report (exit ${exitCode})`;
}

/** The problem of a runner whose exit says it failed while its report names no failure: the report cannot be trusted as a Green. */
export function incoherentExit(kind: string, exitCode: number | null, what: string): string {
  return `${kind}: the runner exited ${exitCode} but its report names no ${what}`;
}
