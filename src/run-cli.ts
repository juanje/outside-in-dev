import { ProgressError } from "./artifacts/progress.js";
import { commandError, HELP_FLAG, row } from "./cli-usage.js";
import type { CliIo } from "./cli-io.js";
import type { VerifyServices } from "./artifacts/verify-lock.js";
import type { RunServices } from "./orchestrator/services.js";
import type { AbortServices } from "./commands/abort.js";
import type { DoctorServices } from "./commands/doctor.js";
import type { SetupServices } from "./commands/setup.js";
import { packageVersion } from "./version.js";

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
  setup: {
    summary: "Set up the providers, the credentials and the models of the roles, for the user",
    usage: "oid setup [--provider P] [--login | --api-key-stdin] [--import-pi] [--model ROLE=provider/id]...",
    options: {
      "--provider": "The provider to log in to (an id of Pi's catalogue)",
      "--login": "Log in with the provider's own login, at a terminal",
      "--api-key-stdin": "Store the API key read from standard input for the provider (never from an argument)",
      "--import-pi": "Copy the credentials of an existing Pi installation (PI_CODING_AGENT_DIR, else ~/.pi/agent)",
      "--model": "Assign a model of the catalogue to a role: fast, default, strong or spec (repeatable)",
    },
    extra: async () => "\nWithout options, at a terminal, oid setup asks for what it needs. Without a terminal, give options.\n",
  },
  doctor: {
    summary: "Check, without changing anything, that oid can run here: the project's tools, the models of the roles and their credentials",
    usage: "oid doctor [--connect]",
    options: { "--connect": "Also make one minimal call to each provider that has a credential (this uses the network)" },
    extra: async () => "\nOne line for each check: ok, missing (with the command that fixes it) or failed.\n\nExit codes:\n  0  everything is ok\n  1  something is missing or failed\n",
  },
  run: {
    summary: "Start a run: lock, worktree, baseline of the suite and selection of the features",
    usage: "oid run [--fr ID...] [--max-frs N] [--branch NAME]",
    options: {
      "--fr": "Work on these features instead of the pending ones, in the order given",
      "--max-frs": "Work on at most this many features",
      "--branch": "Name the run's branch after the configured prefix, instead of the start time",
    },
    extra: async () => "\nExit codes:\n  0  the start finished (or there is nothing to do)\n  1  error\n  3  waiting for an answer with no terminal: the session is saved\n",
  },
  verify: {
    summary: "Verify that a test or a scenario is a valid Red, that a Green has no regression, or the integrity of a change",
    usage: 'oid verify red "<test file> > <test name>" [--decide <class>]\n       oid verify red <feature file>:<line> [--decide <class>]\n       oid verify red "<scenario name>" [--decide <class>]\n       oid verify green [<feature file>:<line> | "<scenario name>"]...\n       oid verify integrity [--step <step>] [--path <file>]',
    options: {
      "--decide": "Answer the failure the last run of the same target recorded, without running it again (refused if files changed since): business_assertion or missing_implementation (a valid Red), test_bug or environment (not a Red)",
      "--step": "Check the rules of this cycle step instead of the step of the focused feature",
    },
    extra: async () => "\nExit codes:\n  0  valid Red, or a Green with no problem\n  1  not a valid Red, a Green with problems, or a usage error\n  2  needs a decision: answer with --decide <class>\n\noid verify integrity prints one line for each rule that the changes break (exit 1), or `integrity: ok` (exit 0).\n\noid verify integrity --path <file> answers, before the file is changed, whether the step of the feature in focus allows it: `integrity: ok` (exit 0, also when the path alone cannot tell), or one line naming the file, its kind, the step and the move that would allow it (exit 1).\n",
  },
  resume: {
    summary: "Resume the run the session saved, at the state it stopped in",
    usage: "oid resume",
    options: {},
    extra: async () =>
      "\nThe worktree goes back to its last checkpoint: what the run changed after it is discarded, and listed. The feature files that wait for their review are kept and put to the person again. A lock left by a process that is not running is released.\n\nExit codes:\n  0  the run finished\n  1  error, or no run to resume\n  2  the run was aborted\n  3  waiting for an answer with no terminal: the session is saved\n",
  },
  abort: {
    summary: "Stop the run in progress after the step it is in",
    usage: "oid abort",
    options: {},
    extra: async () => "\nThe run keeps its worktree, its last checkpoint and its session: oid resume continues it.\n",
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
/** The option that prints the version, as the overview help lists it. */
const VERSION_OPTION = "-v, --version";
const COMMAND_NAMES = Object.keys(COMMANDS);

type Services = RunServices | VerifyServices | AbortServices | SetupServices | DoctorServices;
type Runner = (rest: string[], io: CliIo, services?: Services) => Promise<number>;

/** What each command does with its arguments; a command's module loads only when it runs. */
const RUNNERS: Record<string, Runner> = {
  progress: async (rest, io) => {
    (await import("./commands/progress.js")).runProgress(rest, io);
    return 0;
  },
  check: async (rest, io) => (await import("./commands/check.js")).runCheck(io, rest.includes("--json")),
  init: async (rest, io, services) => {
    const exitCode = (await import("./commands/init.js")).runInit(io, rest.includes("--import-progress"), rest.find((arg) => !arg.startsWith("--")));
    await (await import("./commands/setup.js")).offerSetup(io, services as SetupServices | undefined);
    return exitCode;
  },
  setup: async (rest, io, services) => (await import("./commands/setup.js")).runSetup(io, rest, services as SetupServices),
  doctor: async (rest, io, services) => (await import("./commands/doctor.js")).runDoctor(io, rest, services as DoctorServices),
  run: async (rest, io, services) => (await import("./commands/run.js")).runRun(io, rest, services as RunServices),
  verify: async (rest, io, services) => (await import("./commands/verify.js")).runVerify(io, rest, services as VerifyServices | undefined),
  resume: async (_rest, io, services) => (await import("./commands/resume.js")).runResume(io, services as RunServices),
  abort: async (_rest, io, services) => (await import("./commands/abort.js")).runAbort(io, services as AbortServices),
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
    `Options:\n${row(VERSION_OPTION, "Print the version of oid")}\n`,
    `Run oid <command> ${HELP_FLAG} for the details of one command.\n`,
  ].join("");
}

async function commandHelp({ summary, usage, options, extra }: CommandHelp): Promise<string> {
  const extraText = extra === undefined ? "" : await extra();
  const optionLines = Object.entries(options).map(([name, text]) => row(name, text));
  return `${summary}\n\nusage: ${usage}\n${optionLines.length > 0 ? `\nOptions:\n${optionLines.join("")}` : ""}${extraText}`;
}

export async function runCli(args: string[], io: CliIo, services?: Services): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (command === undefined || command === HELP_FLAG) {
      io.stdout(overviewHelp());
      return 0;
    }
    if (command === "--version" || command === "-v") {
      io.stdout(`oid ${packageVersion()}\n`);
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
    return await RUNNERS[command!]!(rest, io, services);
  } catch (error) {
    if (error instanceof ProgressError) {
      io.stderr(`error: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
