import { ProgressError } from "./artifacts/progress.js";
import { commandError, HELP_FLAG, row } from "./cli-usage.js";
import type { CliIo } from "./cli-io.js";

type CommandHelp = { summary: string; usage: string; options: Record<string, string>; extra?: () => Promise<string> };

const COMMANDS: Record<string, CommandHelp> = {
  progress: {
    summary: "Read and update the progress file",
    usage: "oid progress <subcommand>",
    options: {},
    extra: async () => (await import("./commands/progress.js")).progressHelp(),
  },
  check: {
    summary: "Check the specification, traceability and progress",
    usage: "oid check [--json]",
    options: { "--json": "Print the result as one JSON document" },
  },
  init: {
    summary: "Detect the project setup and initialise progress",
    usage: "oid init [--import-progress [path]]",
    options: { "--import-progress": "Convert a progress file written for an earlier schema" },
  },
  verify: {
    summary: "Verify that a test or a scenario is a valid Red",
    usage: 'oid verify red "<test file> > <test name>" [--decide <class>]\n       oid verify red <feature file>:<line> [--decide <class>]',
    options: {
      "--decide": "Answer a failure that needs a decision: business_assertion or missing_implementation (a valid Red), test_bug or environment (not a Red)",
    },
    extra: async () => "\nExit codes:\n  0  valid Red\n  1  not a valid Red, or a usage error\n  2  needs a decision: answer with --decide <class>\n",
  },
  metrics: {
    summary: "Report the code-health findings of the project",
    usage: "oid metrics [--changed]\n       oid metrics --baseline",
    options: {
      "--changed": "Report only the findings on lines changed since the last commit that the baseline does not hold; exit 1 when one remains",
      "--baseline": "Record the current findings as the baseline of existing debt",
    },
  },
};
const COMMAND_NAMES = Object.keys(COMMANDS);

type Runner = (rest: string[], io: CliIo) => Promise<number>;

/** What each command does with its arguments; a command's module loads only when it runs. */
const RUNNERS: Record<string, Runner> = {
  progress: async (rest, io) => {
    (await import("./commands/progress.js")).runProgress(rest, io);
    return 0;
  },
  check: async (rest, io) => (await import("./commands/check.js")).runCheck(io, rest.includes("--json")),
  init: async (rest, io) => (await import("./commands/init.js")).runInit(io, rest.includes("--import-progress"), rest.find((arg) => !arg.startsWith("--"))),
  verify: async (rest, io) => (await import("./commands/verify.js")).runVerify(io, rest),
  metrics: async (rest, io) => {
    const { runMetrics } = await import("./commands/metrics.js");
    return runMetrics(io, { changed: rest.includes("--changed"), baseline: rest.includes("--baseline") });
  },
};

function overviewHelp(): string {
  const commands = COMMAND_NAMES.map((name) => row(name, COMMANDS[name]!.summary)).join("");
  return [
    "oid enforces the Outside-In development methodology (Spec, BDD, TDD).\n\n",
    "usage: oid <command> [<subcommand>] [arguments]\n\n",
    `Commands:\n${commands}\n`,
    `Run oid <command> ${HELP_FLAG} for the details of one command.\n`,
  ].join("");
}

async function commandHelp({ summary, usage, options, extra }: CommandHelp): Promise<string> {
  const extraText = extra === undefined ? "" : await extra();
  const optionLines = Object.entries(options).map(([name, text]) => row(name, text));
  return `${summary}\n\nusage: ${usage}\n${optionLines.length > 0 ? `\nOptions:\n${optionLines.join("")}` : ""}${extraText}`;
}

export async function runCli(args: string[], io: CliIo): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (command === HELP_FLAG) {
      io.stdout(overviewHelp());
      return 0;
    }
    if (!COMMAND_NAMES.includes(command!)) {
      throw commandError("command", command, COMMAND_NAMES);
    }
    const helpRequested = command === "progress" ? rest[0] === HELP_FLAG : rest.includes(HELP_FLAG);
    if (helpRequested) {
      io.stdout(await commandHelp(COMMANDS[command!]!));
      return 0;
    }
    return await RUNNERS[command!]!(rest, io);
  } catch (error) {
    if (error instanceof ProgressError) {
      io.stderr(`error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
