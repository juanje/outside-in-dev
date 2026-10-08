import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { gitIn } from "./git-fixture.js";
import { SCENARIO, stepsProject } from "./feature-cycle-fixture.js";
import { approvedRun, readJson } from "./loop-fixture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

describe("BDD Red of a run", () => {
  it("has the agent write the steps of the first scenario, checkpoints the valid Red and moves the run to TDD Red, where a test-writing agent that writes no test ends the run", async () => {
    const project = stepsProject();
    const agent = new FakeAgent();
    const { exitCode, saved, log } = await approvedRun(project, agent);
    const progress = readJson(join(saved.worktree, "progress.json")).features.map((feature: { id: string; cycle_step: string; scenarios: unknown[] }) => [feature.id, feature.cycle_step, feature.scenarios]);
    expect({
      exitCode,
      transition: log.filter((event) => event.type === "state_change").at(-1).to,
      session: [saved.state, saved.fr, saved.scenario],
      commit: gitIn(saved.worktree, "log", "-1", "--format=%s"),
      progress,
      task: agent.stepTasks[0]?.split("\n")[0],
    }).toEqual({
      exitCode: 1,
      transition: "TDD_RED",
      session: ["TDD_RED", "FR-A-01", { index: 0, name: SCENARIO, location: "features/FR-A-01.feature:4" }],
      commit: `oid: checkpoint FR-A-01 BDD_RED ${SCENARIO}`,
      progress: [["FR-A-01", "tdd_red", [{ name: SCENARIO, bdd: "fail" }]], ["FR-A-02", "bdd_red", []]],
      task: "You write the step definitions for the first scenario of FR-A-01. Follow these steps in order.",
    });
  });
});
