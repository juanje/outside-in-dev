import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** One run of a recording command: the arguments it received and the environment variables it was asked to record (a variable that was not set is absent). */
export interface RecordedInvocation {
  args: string[];
  env: Record<string, string>;
}

/** What `createRecordingCommand` asks for: where to write the script, which variables to record, and optionally a non-zero exit code. */
export interface RecordingCommandOptions {
  /** The directory that receives the script and its records; created when missing. */
  dir: string;
  /** The names of the environment variables to record on each run, for example `["OID_EVENT", "OID_MESSAGE"]`. */
  env?: string[];
  /** When set, the command exits with this code after recording, to test a command that fails. */
  exitCode?: number;
}

/** A recording command: the line to configure and the reader of what it recorded. */
export interface RecordingCommand {
  /** A shell command line (`node "<script>"`) to configure where the code under test runs a command. */
  command: string;
  /** The invocations recorded so far, in order; an empty array when the command never ran. */
  invocations(): RecordedInvocation[];
}

const SCRIPT_NAME = "recording-command.cjs";
const RECORDS_NAME = "recording-command.jsonl";

/** Writes a Node script in `dir` that appends one JSON line per run (its arguments and the named environment variables), and returns its command line and a reader of the records. */
export function createRecordingCommand(options: RecordingCommandOptions): RecordingCommand {
  mkdirSync(options.dir, { recursive: true });
  const script = join(options.dir, SCRIPT_NAME);
  const records = join(options.dir, RECORDS_NAME);
  const names = JSON.stringify(options.env ?? []);
  const exitCode = JSON.stringify(options.exitCode ?? 0);
  writeFileSync(
    script,
    `const { appendFileSync } = require("node:fs");
const names = ${names};
const env = {};
for (const name of names) {
  if (process.env[name] !== undefined) env[name] = process.env[name];
}
appendFileSync(${JSON.stringify(records)}, JSON.stringify({ args: process.argv.slice(2), env }) + "\\n");
process.exit(${exitCode});
`,
  );
  return {
    command: `node "${script}"`,
    invocations: () => {
      if (!existsSync(records)) return [];
      return readFileSync(records, "utf8")
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line) as RecordedInvocation);
    },
  };
}
