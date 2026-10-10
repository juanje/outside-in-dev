import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { gitIn } from "./git-fixture.js";
import { SCENARIO, stepsProject } from "./feature-cycle-fixture.js";
import { approvedRun, readJson } from "./loop-fixture.js";
import { useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

async function bddRedRun() {
  const project = stepsProject();
  const agent = new FakeAgent();
  return { agent, ...(await approvedRun(project, agent)) };
}

describe("BDD Red of a run", () => {
  it("has the agent write the steps of the first scenario, checkpoints the valid Red and moves the run to TDD Red", async () => {
    const { agent, saved, log } = await bddRedRun();
    const progress = readJson(join(saved.worktree, "progress.json")).features.map((feature: { id: string; cycle_step: string; scenarios: unknown[] }) => [feature.id, feature.cycle_step, feature.scenarios]);
    const move = log.find((event) => event.type === "state_change" && event.to === "TDD_RED");
    const subjects = gitIn(saved.worktree, "log", "--format=%s").split("\n");
    expect({
      transition: move && [move.from, move.to],
      checkpoint: subjects.filter((subject) => subject === `oid: checkpoint FR-A-01 BDD_RED ${SCENARIO}`),
      session: [saved.fr, saved.scenario],
      progress,
      task: agent.stepTasks[0]?.split("\n")[0],
    }).toEqual({
      transition: ["BDD_RED", "TDD_RED"],
      checkpoint: [`oid: checkpoint FR-A-01 BDD_RED ${SCENARIO}`],
      session: ["FR-A-01", { index: 0, name: SCENARIO, location: "features/FR-A-01.feature:4" }],
      progress: [["FR-A-01", "tdd_red", [{ name: SCENARIO, bdd: "fail" }]], ["FR-A-02", "bdd_red", []]],
      task: "You are a specialist in Behaviour-Driven Development and test automation: you write the step definitions that turn a Gherkin scenario into an executable test.",
    });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("ends the run in TDD Red when the test-writing agent writes no test", async () => {
    const { exitCode, saved, log } = await bddRedRun();
    const moves = log.filter((event) => event.type === "state_change");
    const errors = log.filter((event) => event.type === "error").map((event) => event.message);
    expect({ exitCode, last: moves.at(-1).to, state: saved.state, errors }).toEqual({
      exitCode: 1,
      last: "TDD_RED",
      state: "TDD_RED",
      errors: ['FR-A-01 "Behaviour of FR-A-01": the report names no unit test'],
    });
  }, REAL_PROCESS_TIMEOUT_MS);
});
