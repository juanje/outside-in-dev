import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PiSdk } from "../../src/agents/runner.js";
import type { ReviewInput } from "../../src/orchestrator/services.js";
import { gitIn } from "./git-fixture.js";
import { committedRunProject } from "./run-fixture.js";
import { dir } from "./temp-project.js";

/** A committed run project whose configuration lets an agent write feature files; returns its path. */
export function featureProject(): string {
  const project = committedRunProject();
  const file = join(project, ".outside-in.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  config.paths.bdd_features = ["features/**/*.feature"];
  writeFileSync(file, JSON.stringify(config));
  gitIn(project, "add", "-A");
  gitIn(project, "commit", "--quiet", "--message", "features can be written");
  return project;
}

/** What `oid run` is given in place of the real agent, the real terminal and the process: the process id of the run and oid's agent directory are fixed. */
export const runServices = (sdk: PiSdk, input: ReviewInput) => ({ sdk, input, pid: process.pid, agentDir: join(dir, "agent") });
