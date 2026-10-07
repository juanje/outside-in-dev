/** The identifier of a run: its start time in UTC, without milliseconds and with `-` in place of `:`, then `suffix`. */
export function newRunId(now: Date, suffix: string): string {
  return `${now.toISOString().replace(/\.\d+Z$/, "Z").replaceAll(":", "-")}-${suffix}`;
}
