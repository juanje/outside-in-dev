import { requireDoneEvidence, requirePassEvidence } from "../artifacts/scenario-evidence.js";
import { advanceStep, CYCLE_STEPS, FEATURE_STATUS, SCENARIO_STATUS, SCENARIO_STATUSES, completeFeature, loadProgress, recordScenario, ProgressError, saveProgress, requireFeature, type FeatureProgress, type Progress } from "../artifacts/progress.js";
import { loadProjectPaths, type ProjectPaths } from "../artifacts/project-paths.js";
import { readRequirementIds } from "../artifacts/spec.js";
import { commandError, HELP_FLAG, row } from "../cli-usage.js";
import type { CliIo } from "../cli-io.js";

type Context = CliIo & { paths: ProjectPaths };

function summary(feature: FeatureProgress): string {
  const step = feature.cycle_step ? ` ${feature.cycle_step}` : "";
  return `${feature.id}  ${feature.title}  ${feature.status}${step}`;
}

function describe(feature: FeatureProgress): string {
  const scenarios = (feature.scenarios ?? []).map((s) => `  ${s.name}  ${s.bdd}\n`).join("");
  return `${summary(feature)}\n${scenarios}`;
}

function showCurrent(progress: Progress, io: Context): void {
  const focused = progress.features.find((f) => f.id === progress.current_focus);
  io.stdout(focused ? describe(focused) : "No feature is focused\n");
}

function showFeature(progress: Progress, io: Context, id: string | undefined): void {
  io.stdout(describe(requireFeature(progress, id, io.paths.progress)));
}

function addFeature(progress: Progress, io: Context, id: string, title: string): void {
  if (progress.features.some((f) => f.id === id)) {
    throw new ProgressError(`${id} is already tracked in ${io.paths.progress}`);
  }
  if (!readRequirementIds(io.cwd, io.paths.spec).includes(id)) {
    throw new ProgressError(`${id} is not defined in ${io.paths.spec}`);
  }
  progress.features.push({ id, title, status: FEATURE_STATUS.pending });
  saveProgress(io.cwd, progress, io.paths.progress);
}

function focusFeature(progress: Progress, io: Context, id: string): void {
  requireFeature(progress, id, io.paths.progress);
  progress.current_focus = id;
  saveProgress(io.cwd, progress, io.paths.progress);
}

function stepFeature(progress: Progress, io: Context, id: string, step: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  progress.features[progress.features.indexOf(feature)] = advanceStep(feature, step);
  saveProgress(io.cwd, progress, io.paths.progress);
}

function recordFeatureScenario(progress: Progress, io: Context, status: string, id: string, name: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  if (status === SCENARIO_STATUS.pass) requirePassEvidence(io.cwd, id, name);
  progress.features[progress.features.indexOf(feature)] = recordScenario(feature, name, status);
  saveProgress(io.cwd, progress, io.paths.progress);
}

function doneFeature(progress: Progress, io: Context, id: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  const done = completeFeature(feature);
  requireDoneEvidence(io.cwd, id, (feature.scenarios ?? []).map(({ name }) => name));
  progress.features[progress.features.indexOf(feature)] = done;
  if (progress.current_focus === id) progress.current_focus = null;
  saveProgress(io.cwd, progress, io.paths.progress);
}

function showStatus(progress: Progress, io: Context, all: boolean): void {
  const listed = all ? progress.features : progress.features.filter((f) => f.status !== FEATURE_STATUS.done);
  for (const feature of listed) {
    const focus = feature.id === progress.current_focus ? " (focused)" : "";
    io.stdout(`${summary(feature)}${focus}\n`);
  }
  if (!all) io.stdout(`${progress.features.length - listed.length} done\n`);
}

const ID = "FR-xxx";
const ALL_FLAG = "--all";
type SubcommandHelp = {
  summary: string;
  operands: string[];
  options?: Record<string, string>;
  allowed?: { label: string; values: string[] };
};
const SUBCOMMAND_HELP: Record<string, SubcommandHelp> = {
  current: { summary: "Show the focused feature", operands: [] },
  status: {
    summary: "List the features that are not done and count the done ones",
    operands: [],
    options: { [ALL_FLAG]: "List every tracked feature" },
  },
  show: { summary: "Show one feature with its scenarios", operands: [ID] },
  add: { summary: "Track a feature defined in the specification", operands: [ID, '"<title>"'] },
  focus: { summary: "Focus a tracked feature", operands: [ID] },
  step: {
    summary: "Move a feature to its next cycle step",
    operands: [ID, "<cycle_step>"],
    allowed: { label: "Cycle steps", values: CYCLE_STEPS },
  },
  scenario: {
    summary: "Record the status of a scenario",
    operands: ["<pass|fail|pending>", ID, '"<scenario name>"'],
    allowed: { label: "Statuses", values: SCENARIO_STATUSES },
  },
  done: { summary: "Mark a feature done once every scenario passes", operands: [ID] },
};
const SUBCOMMANDS = Object.keys(SUBCOMMAND_HELP);

function subcommandUsage(subcommand: string): string {
  const { operands, options = {} } = SUBCOMMAND_HELP[subcommand]!;
  return ["oid progress", subcommand, ...operands, ...Object.keys(options).map((name) => `[${name}]`)].join(" ");
}

function subcommandHelp(subcommand: string): string {
  const { summary, allowed, options = {} } = SUBCOMMAND_HELP[subcommand]!;
  const optionLines = Object.entries(options).map(([name, text]) => row(name, text));
  const flags = optionLines.length > 0 ? `\nOptions:\n${optionLines.join("")}` : "";
  const values = allowed ? `\n${allowed.label}: ${allowed.values.join(", ")}\n` : "";
  return `${summary}\n\nusage: ${subcommandUsage(subcommand)}\n${flags}${values}`;
}

/** The subcommands of `oid progress`, each with its summary and usage, for `oid progress --help`. */
export function progressHelp(): string {
  const entries = SUBCOMMANDS.map((name) => row(name, SUBCOMMAND_HELP[name]!.summary) + row("", subcommandUsage(name)));
  return `\nSubcommands:\n${entries.join("")}`;
}

type Action = (progress: Progress, io: Context, operands: string[]) => void;
/** What each subcommand does once its operands are known to be complete; has the same keys as SUBCOMMAND_HELP. */
const ACTIONS: Record<string, Action> = {
  current: (progress, io) => showCurrent(progress, io),
  status: (progress, io, operands) => showStatus(progress, io, operands.includes(ALL_FLAG)),
  show: (progress, io, [id]) => showFeature(progress, io, id),
  add: (progress, io, [id, title]) => addFeature(progress, io, id!, title!),
  focus: (progress, io, [id]) => focusFeature(progress, io, id!),
  step: (progress, io, [id, step]) => stepFeature(progress, io, id!, step!),
  scenario: (progress, io, [status, id, name]) => recordFeatureScenario(progress, io, status!, id!, name!),
  done: (progress, io, [id]) => doneFeature(progress, io, id!),
};

export function runProgress(args: string[], cli: CliIo): void {
  const [command, ...operands] = args;
  if (!SUBCOMMANDS.includes(command!)) {
    throw commandError("subcommand", command, SUBCOMMANDS);
  }
  if (operands.includes(HELP_FLAG)) {
    cli.stdout(subcommandHelp(command));
    return;
  }
  if (operands.length < SUBCOMMAND_HELP[command]!.operands.length) {
    throw new ProgressError(`usage: ${subcommandUsage(command)}`);
  }
  const io: Context = { ...cli, paths: loadProjectPaths(cli.cwd) };
  const progress = loadProgress(io.cwd, io.paths.progress);
  ACTIONS[command]!(progress, io, operands);
}
