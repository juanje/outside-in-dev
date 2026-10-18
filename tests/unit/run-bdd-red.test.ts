import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BDD_RED, profileFor } from "../../src/agents/profiles.js";
import { bddRedPrompt } from "../../src/agents/prompts/bdd-red.js";
import { loadProjectConfig } from "../../src/artifacts/project-config.js";
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
      task: agent.stepTasks[0]?.startsWith(bddRedPrompt("FR-A-01", "features/FR-A-01.feature:4", profileFor(BDD_RED, loadProjectConfig(saved.worktree)))),
    }).toEqual({
      transition: ["BDD_RED", "TDD_RED"],
      checkpoint: [`oid: checkpoint FR-A-01 BDD_RED ${SCENARIO}`],
      session: ["FR-A-01", { index: 0, name: SCENARIO, location: "features/FR-A-01.feature:4" }],
      progress: [["FR-A-01", "tdd_red", [{ name: SCENARIO, bdd: "fail" }]], ["FR-A-02", "bdd_red", []]],
      task: true,
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
      errors: [expect.stringMatching(/^FR-A-01 "Behaviour of FR-A-01": the report names no unit test\nEvidence:\n {2}FR-A-01 "Behaviour of FR-A-01": .+\nNext: name the unit test you wrote/)],
    });
  }, REAL_PROCESS_TIMEOUT_MS);
});

describe("BDD Red of a run when the feature files tag no scenario with the requirement", () => {
  it("stops with a rejection that names the requirement, the feature paths searched and the tag to add", async () => {
    const project = stepsProject();
    const untagging = {
      isTTY: true as const,
      line: async () => "",
      choose: async () => {
        const { worktree } = readJson(join(project, ".outside-in/session.json"));
        const file = join(worktree, "features/FR-A-01.feature");
        writeFileSync(file, readFileSync(file, "utf8").replace("@FR-A-01\n", ""));
        return "approve";
      },
    };
    const { log } = await approvedRun(project, new FakeAgent(), ["run"], untagging);
    const searched = loadProjectConfig(project).paths.bdd_features;
    const errors = log.filter((event) => event.type === "error").map((event) => event.message as string);
    expect(errors.length).toBeGreaterThan(0);
    const [failed] = errors[0]!.split("\n");
    expect(failed).toContain("FR-A-01");
    expect(failed).toMatch(/tagged/);
    for (const path of searched) expect(errors[0]).toContain(path);
    expect(errors[0]).toContain("@FR-A-01");
  }, REAL_PROCESS_TIMEOUT_MS);
});
