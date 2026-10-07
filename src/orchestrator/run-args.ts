const OPTION = /^--/;

export type RunArgs = { fr: string[]; maxFrs?: number; branch?: string };

/** The options of `oid run`: `--fr` takes every identifier after it up to the next option. */
export function parseRunArgs(args: string[]): RunArgs {
  const parsed: RunArgs = { fr: [] };
  let option = "";
  for (const arg of args) {
    if (OPTION.test(arg)) option = arg;
    else if (option === "--fr") parsed.fr.push(arg);
    else if (option === "--max-frs") parsed.maxFrs = Number(arg);
    else if (option === "--branch") parsed.branch = arg;
  }
  return parsed;
}
