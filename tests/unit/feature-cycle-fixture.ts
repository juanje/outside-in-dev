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

/** The scenario of the feature file that the fake agent writes for the first requirement of the run project. */
export const SCENARIO = "Behaviour of FR-A-01";

/** A BDD runner that passes when it runs everything and fails with a missing module when it is asked for the scenario at a location. */
const RUNNER = `
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const located = process.argv.some((arg) => arg.includes(".feature:"));
const result = located ? { status: "FAILED", message: "Error: Cannot find module '" + process.cwd() + "/src/cart.js' imported from " + process.cwd() + "/features/steps/a.steps.ts" } : { status: "PASSED" };
const lines = [
  { pickle: { id: "p", uri: "features/FR-A-01.feature", name: "${SCENARIO}", steps: [{ id: "ps", text: "a step" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: result } },
];
require("node:fs").writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

/** A committed run project whose agent may write step files and whose BDD runner fails the scenario that is asked for. */
export function stepsProject(): string {
  const project = featureProject();
  const file = join(project, ".outside-in.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  config.paths.bdd_steps = ["features/steps/**/*.ts"];
  writeFileSync(file, JSON.stringify(config));
  writeFileSync(join(project, "bdd.cjs"), RUNNER);
  gitIn(project, "add", "-A");
  gitIn(project, "commit", "--quiet", "--message", "steps can be written");
  return project;
}

