import { changedSinceCheckpoint, checkpointEvidence } from "./checkpoint.js";
import { ProgressError } from "./progress.js";
import { loadProjectPaths } from "./project-paths.js";
import { listLocatedScenarios, readFeatureSources } from "./traceability.js";

const OID_DIR = ".outside-in/";
const GREEN_KIND = "green";
const LIST_SEPARATOR = ", ";

/** The command that would give a scenario its evidence: the green with its location, or with a placeholder when the scenario cannot be located. */
function greenCommand(cwd: string, feature: string, name: string): string {
  const { features } = loadProjectPaths(cwd);
  const found = listLocatedScenarios(readFeatureSources(cwd, features)).find((scenario) => scenario.name === name && scenario.tags.includes(`@${feature}`));
  return `oid verify green ${found === undefined ? "<feature>:<line>" : `${found.file}:${found.line}`}`;
}

/** The files that changed since the checkpoint of `feature`, leaving out the progress file and oid's own files. */
function changedSinceGreen(cwd: string, feature: string): string[] {
  const { progress } = loadProjectPaths(cwd);
  return changedSinceCheckpoint(cwd, feature).filter((file) => file !== progress && !file.startsWith(OID_DIR));
}

/** Refuses to record `name` of `feature` as passing unless the checkpoint of the feature is a green that ran it and nothing but the progress file and oid's own files changed since. */
export function requirePassEvidence(cwd: string, feature: string, name: string): void {
  const { kind, scenarios } = checkpointEvidence(cwd, feature);
  const refusal = `${feature} "${name}" cannot be marked pass`;
  const hint = () => `run: ${greenCommand(cwd, feature, name)}`;
  if (kind !== GREEN_KIND || !scenarios.some((scenario) => scenario.feature === feature && scenario.name === name)) {
    throw new ProgressError(`${refusal}: the last verification is not a green that ran it; ${hint()}`);
  }
  const changed = changedSinceGreen(cwd, feature);
  if (changed.length > 0) throw new ProgressError(`${refusal}: changed since the green: ${changed.join(LIST_SEPARATOR)}; ${hint()}`);
}

/** Refuses to mark `feature` done unless the checkpoint of the feature is a green that ran each of its scenarios in `names` and nothing but the progress file and oid's own files changed since. */
export function requireDoneEvidence(cwd: string, feature: string, names: string[]): void {
  const { kind, scenarios } = checkpointEvidence(cwd, feature);
  const refusal = `${feature} cannot be marked done`;
  const hint = "run: oid verify green";
  const lacking = names.filter((name) => kind !== GREEN_KIND || !scenarios.some((scenario) => scenario.feature === feature && scenario.name === name));
  if (lacking.length > 0) {
    throw new ProgressError(`${refusal}: no current green ran the scenarios ${lacking.map((name) => `"${name}"`).join(LIST_SEPARATOR)}; ${hint}`);
  }
  const changed = changedSinceGreen(cwd, feature);
  if (changed.length > 0) throw new ProgressError(`${refusal}: changed since the green: ${changed.join(LIST_SEPARATOR)}; ${hint}`);
}
