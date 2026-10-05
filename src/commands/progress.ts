import { loadProgress, ProgressError, PROGRESS_FILE, saveProgress, type FeatureProgress, type Progress } from "../artifacts/progress.js";
import { readRequirementIds, SPEC_FILE } from "../artifacts/spec.js";
import type { CliIo } from "../cli-io.js";

function summary(feature: FeatureProgress): string {
  const step = feature.cycle_step ? ` ${feature.cycle_step}` : "";
  return `${feature.id}  ${feature.title}  ${feature.status}${step}`;
}

function describe(feature: FeatureProgress): string {
  const scenarios = (feature.scenarios ?? []).map((s) => `  ${s.name}  ${s.bdd}\n`).join("");
  return `${summary(feature)}\n${scenarios}`;
}

function showCurrent(progress: Progress, io: CliIo): void {
  const focused = progress.features.find((f) => f.id === progress.current_focus);
  io.stdout(focused ? describe(focused) : "No feature is focused\n");
}

function showFeature(progress: Progress, io: CliIo, id: string | undefined): void {
  const feature = progress.features.find((f) => f.id === id);
  if (!feature) throw new ProgressError(`${id} is not tracked in ${PROGRESS_FILE}`);
  io.stdout(describe(feature));
}

function addFeature(progress: Progress, io: CliIo, id: string, title: string): void {
  if (progress.features.some((f) => f.id === id)) {
    throw new ProgressError(`${id} is already tracked in ${PROGRESS_FILE}`);
  }
  if (!readRequirementIds(io.cwd).includes(id)) {
    throw new ProgressError(`${id} is not defined in ${SPEC_FILE}`);
  }
  progress.features.push({ id, title, status: "pending" });
  saveProgress(io.cwd, progress);
}

function showStatus(progress: Progress, io: CliIo): void {
  for (const feature of progress.features) {
    const focus = feature.id === progress.current_focus ? " (focused)" : "";
    io.stdout(`${summary(feature)}${focus}\n`);
  }
}

export function runProgress(args: string[], io: CliIo): void {
  const progress = loadProgress(io.cwd);
  const [command, id, title] = args;
  if (command === "current") showCurrent(progress, io);
  else if (command === "show") showFeature(progress, io, id);
  else if (command === "add") addFeature(progress, io, id!, title!);
  else showStatus(progress, io);
}
