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
    if (command === "check") return (await import("./commands/check.js")).runCheck(io, rest.includes("--json"));
    if (command === "metrics") {
      const { runMetrics } = await import("./commands/metrics.js");
      return runMetrics(io, { changed: rest.includes("--changed"), baseline: rest.includes("--baseline") });
    }
    if (command === "init") {
      return (await import("./commands/init.js")).runInit(io, rest.includes("--import-progress"), rest.find((arg) => !arg.startsWith("--")));
    }
    (await import("./commands/progress.js")).runProgress(rest, io);
    return 0;
  } catch (error) {
    if (error instanceof ProgressError) {
      io.stderr(`error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
