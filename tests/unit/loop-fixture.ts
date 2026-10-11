import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gitIn } from "./git-fixture.js";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { runCli } from "../../src/run-cli.js";
import type { ReviewInput } from "../../src/orchestrator/services.js";
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

export const approve = { isTTY: true as const, choose: async () => "approve", line: async () => "" };

/** A human at a terminal who gives these answers one after the other, and the same note whenever asked for a line. */
export function answering(answers: string[], note = "") {
  const left = [...answers];
  return { isTTY: true as const, choose: async () => left.shift() ?? "", line: async () => note };
}

/** A project whose only scenario stays red, with one iteration at most, and the agent that writes a unit test and the cart code for it. */
export function stuckProject() {
  const project = loopProject();
  const runner = join(project, "bdd.cjs");
  writeFileSync(runner, readFileSync(runner, "utf8").replace('located && !fs.existsSync("src/cart.ts")', "located"));
  const config = join(project, ".outside-in.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), limits: { max_inner_iterations: 1 } }));
  gitIn(project, "commit", "--quiet", "--all", "--message", "the scenario stays red, one iteration at most");
  const agent = new FakeAgent();
  agent.testRoute.rounds.push({ files: [{ path: "tests/unit/cart.test.ts", content: "// the test\n" }], test: "tests/unit/cart.test.ts > cart > adds" });
  agent.codeRoute.rounds.push({ files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
  return { project, agent };
}

/** The file as a JSON document. */
export const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

/** Runs `oid run` (or the command `args`) in the project with the agent and a human who approves the feature files: the exit code, the saved session and the events of the run. */
export async function approvedRun(project: string, agent: FakeAgent, args: string[] = ["run"], input: ReviewInput = approve) {
  const exitCode = await runCli(args, { cwd: project, stdout: () => undefined, stderr: () => undefined }, runServices(agent.sdk, input));
  const saved = readJson(join(project, ".outside-in/session.json"));
  const [run] = readdirSync(join(project, ".outside-in/runs"));
  const log = readFileSync(join(project, ".outside-in/runs", run!, "events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
  return { exitCode, saved, log };
}
