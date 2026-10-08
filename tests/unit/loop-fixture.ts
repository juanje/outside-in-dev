import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gitIn } from "./git-fixture.js";
import type { FakeAgent } from "../../features/support/fake-agent.js";
import { runCli } from "../../src/run-cli.js";
import { runServices, stepsProject } from "./feature-cycle-fixture.js";

/** The BDD runner: the whole suite passes; a scenario asked for by location passes once src/cart.ts exists and fails with a missing module before. */
const BDD_RUNNER = `
const fs = require("node:fs");
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const located = process.argv.some((arg) => arg.includes(".feature:"));
const missing = located && !fs.existsSync("src/cart.ts");
const result = missing ? { status: "FAILED", message: "Error: Cannot find module '" + process.cwd() + "/src/cart.js' imported from " + process.cwd() + "/features/steps/a.steps.ts" } : { status: "PASSED" };
const lines = [
  { pickle: { id: "p", uri: "features/FR-A-01.feature", name: "Behaviour of FR-A-01", steps: [{ id: "ps", text: "a step" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: result } },
];
fs.writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

/** The unit runner: the old test passes; the new test file, once written, fails to load until src/cart.ts exists and passes after. */
const UNIT_RUNNER = `
const fs = require("node:fs");
const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice(13);
const old = { name: process.cwd() + "/tests/unit/old.test.ts", message: "", assertionResults: [{ ancestorTitles: [], fullName: "old works", title: "old works", status: "passed", failureMessages: [] }] };
const written = fs.existsSync("tests/unit/cart.test.ts");
const added = fs.existsSync("src/cart.ts")
  ? { name: process.cwd() + "/tests/unit/cart.test.ts", message: "", assertionResults: [{ ancestorTitles: ["cart"], fullName: "cart adds", title: "adds", status: "passed", failureMessages: [] }] }
  : { name: process.cwd() + "/tests/unit/cart.test.ts", message: "Cannot find module '../../src/cart.js' imported from '" + process.cwd() + "/tests/unit/cart.test.ts'", assertionResults: [] };
fs.writeFileSync(out, JSON.stringify({ testResults: written ? [added, old] : [old] }));
`;

/** A committed run project whose agents may write steps, unit tests and source, and whose runners follow the files the agents write; returns its path. */
export function loopProject(): string {
  const project = stepsProject();
  const file = join(project, ".outside-in.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  config.paths.unit_tests = ["tests/unit/**/*.ts"];
  config.commands.unit = "node unit.cjs";
  config.commands.typecheck = "node tsc.cjs";
  writeFileSync(file, JSON.stringify(config));
  writeFileSync(join(project, "bdd.cjs"), BDD_RUNNER);
  writeFileSync(join(project, "unit.cjs"), UNIT_RUNNER);
  writeFileSync(join(project, "tsc.cjs"), "process.exit(0);\n");
  gitIn(project, "add", "-A");
  gitIn(project, "commit", "--quiet", "--message", "the inner loop can run");
  return project;
}

const approve = { isTTY: true as const, choose: async () => "approve", line: async () => "" };

/** The file as a JSON document. */
export const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

/** Runs `oid run` in the project with the agent and a human who approves the feature files: the exit code, the saved session and the events of the run. */
export async function approvedRun(project: string, agent: FakeAgent) {
  const exitCode = await runCli(["run"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, runServices(agent.sdk, approve));
  const saved = readJson(join(project, ".outside-in/session.json"));
  const [run] = readdirSync(join(project, ".outside-in/runs"));
  const log = readFileSync(join(project, ".outside-in/runs", run!, "events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
  return { exitCode, saved, log };
}
