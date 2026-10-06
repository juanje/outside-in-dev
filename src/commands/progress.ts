import { advanceStep, completeFeature, loadProgress, recordScenario, ProgressError, saveProgress, requireFeature, type FeatureProgress, type Progress } from "../artifacts/progress.js";
import { loadProjectPaths, type ProjectPaths } from "../artifacts/project-paths.js";
import { readRequirementIds } from "../artifacts/spec.js";
import { commandError } from "../cli-usage.js";
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
  progress.features.push({ id, title, status: "pending" });
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
  progress.features[progress.features.indexOf(feature)] = recordScenario(feature, name, status);
  saveProgress(io.cwd, progress, io.paths.progress);
}

function doneFeature(progress: Progress, io: Context, id: string): void {
  const feature = requireFeature(progress, id, io.paths.progress);
  progress.features[progress.features.indexOf(feature)] = completeFeature(feature);
  if (progress.current_focus === id) progress.current_focus = null;
  saveProgress(io.cwd, progress, io.paths.progress);
}

function showStatus(progress: Progress, io: Context): void {
  for (const feature of progress.features) {
    const focus = feature.id === progress.current_focus ? " (focused)" : "";
    io.stdout(`${summary(feature)}${focus}\n`);
  }
}

const ID = "FR-xxx";
const OPERANDS: Record<string, string[]> = {
  current: [],
  status: [],
  show: [ID],
  add: [ID, '"<title>"'],
  focus: [ID],
  step: [ID, "<cycle_step>"],
  scenario: ["<pass|fail|pending>", ID, '"<scenario name>"'],
  done: [ID],
};
const SUBCOMMANDS = Object.keys(OPERANDS);

export function runProgress(args: string[], cli: CliIo): void {
  const [command, ...operands] = args;
  if (!SUBCOMMANDS.includes(command!)) {
    throw commandError("subcommand", command, SUBCOMMANDS);
  }
  const expected = OPERANDS[command]!;
  if (operands.length < expected.length) {
    throw new ProgressError(`usage: oid progress ${command} ${expected.join(" ")}`);
  }
  const io: Context = { ...cli, paths: loadProjectPaths(cli.cwd) };
  const progress = loadProgress(io.cwd, io.paths.progress);
  if (command === "current") showCurrent(progress, io);
  else if (command === "show") showFeature(progress, io, operands[0]);
  else if (command === "add") addFeature(progress, io, operands[0]!, operands[1]!);
  else if (command === "focus") focusFeature(progress, io, operands[0]!);
  else if (command === "step") stepFeature(progress, io, operands[0]!, operands[1]!);
  else if (command === "done") doneFeature(progress, io, operands[0]!);
  else if (command === "scenario") {
    const [status, id, name] = operands;
    recordFeatureScenario(progress, io, status!, id!, name!);
  } else showStatus(progress, io);
}
