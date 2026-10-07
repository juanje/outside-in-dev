import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordCheckpoint, type EvidenceScenario } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, write, writeProgressFile } from "./temp-project.js";

/** Records a checkpoint of a verification of `kind` for FR-X-01 in the temporary project, with the scenarios it ran. */
export function recordVerification(kind: "green" | "red", scenarios: EvidenceScenario[]): void {
  const step = kind === "green" ? "tdd_green" : "tdd_red";
  recordCheckpoint(dir, { step, feature: "FR-X-01", verify: { kind, target: "all" }, external: false, date: new Date(0), scenarios });
}

/** Makes the temporary project a git repository with a source file and `progress` committed. */
export function startProject(progress: object): void {
  write("src/a.ts", "export const a = 1;\n");
  writeProgressFile(progress);
  commitAll();
}

/** The first feature of the progress file of the temporary project, parsed. */
export function firstFeature(): { status: string; scenarios: { bdd: string }[] } {
  return JSON.parse(readFileSync(join(dir, "progress.json"), "utf8")).features[0];
}

/** Runs `oid` with `args` in the temporary project. */
export const run = runInProject;

/** A progress file with FR-X-01 in progress, at `step`, with `scenarios`. */
export function progressOf(step: string, scenarios: { name: string; bdd: string }[]): object {
  return { current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "Alpha", status: "in_progress", cycle_step: step, scenarios }] };
}
