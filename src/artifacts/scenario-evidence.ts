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

/** Refuses to record `name` of `feature` as passing unless the last checkpoint is a green that ran it and nothing but the progress file and oid's own files changed since. */
export function requirePassEvidence(cwd: string, feature: string, name: string): void {
  const { kind, scenarios } = checkpointEvidence(cwd);
  const refusal = `${feature} "${name}" cannot be marked pass`;
  const hint = () => `run: ${greenCommand(cwd, feature, name)}`;
  if (kind !== GREEN_KIND || !scenarios.some((scenario) => scenario.feature === feature && scenario.name === name)) {
    throw new ProgressError(`${refusal}: the last verification is not a green that ran it; ${hint()}`);
  }
  const { progress } = loadProjectPaths(cwd);
  const changed = changedSinceCheckpoint(cwd).filter((file) => file !== progress && !file.startsWith(OID_DIR));
  if (changed.length > 0) throw new ProgressError(`${refusal}: changed since the green: ${changed.join(LIST_SEPARATOR)}; ${hint()}`);
}
