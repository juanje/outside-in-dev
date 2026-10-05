import type { CliIo } from "../cli-io.js";
import { loadProgress, ProgressError, PROGRESS_FILE, type FeatureProgress } from "../artifacts/progress.js";

function summary(feature: FeatureProgress): string {
  const step = feature.cycle_step ? ` ${feature.cycle_step}` : "";
  return `${feature.id}  ${feature.title}  ${feature.status}${step}`;
}

function describe(feature: FeatureProgress): string {
  const scenarios = (feature.scenarios ?? []).map((s) => `  ${s.name}  ${s.bdd}\n`).join("");
  return `${summary(feature)}\n${scenarios}`;
}

export function runProgress(args: string[], io: CliIo): void {
  const progress = loadProgress(io.cwd);
  if (args[0] === "current") {
    const focused = progress.features.find((f) => f.id === progress.current_focus);
    io.stdout(focused ? describe(focused) : "No feature is focused\n");
    return;
  }
  if (args[0] === "show") {
    const feature = progress.features.find((f) => f.id === args[1]);
    if (!feature) throw new ProgressError(`${args[1]} is not tracked in ${PROGRESS_FILE}`);
    io.stdout(describe(feature));
    return;
  }
  for (const feature of progress.features) {
    const focus = feature.id === progress.current_focus ? " (focused)" : "";
    io.stdout(`${summary(feature)}${focus}\n`);
  }
}
