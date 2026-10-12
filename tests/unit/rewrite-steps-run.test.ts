import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { gitIn } from "./git-fixture.js";
import { answering, approvedRun, loopProject } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, useTempDir } from "./temp-project.js";

useTempDir();

const STEPS = "features/steps/a.steps.ts";
const TEST_FILE = "tests/unit/cart.test.ts";
const TEST = `${TEST_FILE} > cart > adds`;
const MISSING = `"Error: Cannot find module '" + process.cwd() + "/src/cart.js' imported from " + process.cwd() + "/features/steps/a.steps.ts"`;

/** The BDD runner: a scenario asked for by location fails with a missing module without src/cart.ts, fails with a wrong step while the steps do not say "fixed", and passes otherwise. */
const RUNNER = `
const fs = require("node:fs");
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const located = process.argv.some((arg) => arg.includes(".feature:"));
const steps = fs.existsSync("${STEPS}") ? fs.readFileSync("${STEPS}", "utf8") : "";
let result = { status: "PASSED" };
if (located && !fs.existsSync("src/cart.ts")) result = { status: "FAILED", message: ${MISSING} };
else if (located && !steps.includes("fixed")) result = { status: "FAILED", message: "Error: the step counts the wrong lines" };
const lines = [
  { pickle: { id: "p", uri: "features/FR-A-01.feature", name: "Behaviour of FR-A-01", steps: [{ id: "ps", text: "a step" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: result } },
];
fs.writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;

/** A loop project whose scenario is red after the first iteration until its steps are rewritten, and the agent that writes steps, a unit test and the cart code. */
function stepsGoneWrong() {
  const project = loopProject();
  writeFileSync(join(project, "bdd.cjs"), RUNNER);
  const config = join(project, ".outside-in.json");
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), limits: { max_inner_iterations: 1 } }));
  gitIn(project, "commit", "--quiet", "--all", "--message", "the steps count the wrong lines");
  const agent = new FakeAgent();
  agent.stepRounds = [[{ path: STEPS, content: "// first steps\n" }], [{ path: STEPS, content: "// fixed steps\n" }]];
  agent.testRoute.rounds.push({ files: [{ path: TEST_FILE, content: "// the first test\n" }], test: TEST });
  return { project, agent };
}

const textOf = (worktree: string, file: string): string | undefined => (existsSync(join(worktree, file)) ? readFileSync(join(worktree, file), "utf8") : undefined);

const moved = (log: { type: string; from?: string; to?: string; reason?: string }[], from: string, to: string) => log.find((event) => event.type === "state_change" && event.from === from && event.to === to);

describe("writing the steps of a scenario again", () => {
  it("keeps the code of the scenario, has the steps written again with the note, and goes to the BDD check once they pass with the code and fail without it", async () => {
    const { project, agent } = stepsGoneWrong();
    agent.codeRoute.rounds.push({ files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
    const { saved, log } = await approvedRun(project, agent, ["run"], answering(["approve", "rewrite_steps", "abort"], "count the lines of the cart"));
    const back = moved(log, "BDD_CHECK", "BDD_RED");
    const forth = moved(log, "BDD_RED", "BDD_CHECK");
    expect({
      back: [back?.reason?.includes("written again"), back?.reason?.includes("count the lines of the cart"), back?.reason?.includes("still red")],
      forth: [forth?.reason?.includes("passes with the code"), forth?.reason?.includes("fails without it")],
      task: [agent.stepTasks[1]?.includes("count the lines of the cart"), agent.stepTasks[1]?.includes("the step counts the wrong lines")],
      code: existsSync(join(saved.worktree, "src/cart.ts")),
    }).toEqual({ back: [true, true, true], forth: [true, true], task: [true, true], code: true });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("starts the scenario again when no code was written: its unit test is gone and TDD Red follows the steps that fail validly", async () => {
    const { project, agent } = stepsGoneWrong();
    agent.codeRoute.blocked = { reason: "spec_gap", detail: "the steps count lines the cart cannot give" };
    agent.testRoute.rounds.push({ files: [{ path: TEST_FILE, content: "// the second test\n" }], test: TEST });
    const { saved, log } = await approvedRun(project, agent, ["run"], answering(["approve", "rewrite_steps", "abort"], "count the lines of the cart"));
    const back = moved(log, "CODE_GREEN", "BDD_RED");
    const forth = moved(log, "BDD_RED", "TDD_RED");
    expect({
      back: [back?.reason?.includes("written again"), back?.reason?.includes("the steps count lines the cart cannot give")],
      task: agent.stepTasks[1]?.includes("count the lines of the cart"),
      forth: forth !== undefined,
      secondTest: textOf(saved.worktree, TEST_FILE),
      steps: textOf(saved.worktree, STEPS),
      toCheck: moved(log, "BDD_RED", "BDD_CHECK"),
    }).toEqual({ back: [true, true], task: true, forth: true, secondTest: "// the second test\n", steps: "// fixed steps\n", toCheck: undefined });
  }, REAL_PROCESS_TIMEOUT_MS);
});
