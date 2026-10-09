import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { SCENARIO } from "./feature-cycle-fixture.js";
import { gitIn } from "./git-fixture.js";
import { approvedRun, loopProject } from "./loop-fixture.js";
import { useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

/** A scripted agent that writes the unit test and the code for the one scenario of the first target. */
function cartAgent(): FakeAgent {
  const agent = new FakeAgent();
  agent.testRoute.rounds.push({ files: [{ path: "tests/unit/cart.test.ts", content: "// the test\n" }], test: "tests/unit/cart.test.ts > cart > adds" });
  agent.codeRoute.rounds.push({ files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
  return agent;
}

describe("the inner loop of a run", () => {
  it("has the agents write a unit test and the code for the only scenario, checkpoints each step, records the scenario as passing and the requirement at the quality gate when BDD Check is checkpointed", async () => {
    const project = loopProject();
    const agent = cartAgent();
    const { saved, log } = await approvedRun(project, agent);
    const subjects = gitIn(saved.worktree, "log", "--reflog", "--topo-order", "--format=%s").split("\n").reverse().filter((subject) => subject.startsWith("oid: checkpoint FR-A-01") && subject.endsWith(SCENARIO));
    const atGate = gitIn(saved.worktree, "log", "--reflog", "--topo-order", "--format=%H %s").split("\n").find((line) => line.endsWith(`oid: checkpoint FR-A-01 BDD_CHECK ${SCENARIO}`))!.split(" ")[0]!;
    const feature = JSON.parse(gitIn(saved.worktree, "show", `${atGate}:progress.json`)).features[0];
    const all = log.filter((event) => event.type === "state_change").map((event) => `${event.from} > ${event.to}`);
    expect({
      moves: all.slice(all.indexOf("BDD_RED > TDD_RED"), all.indexOf("BDD_RED > TDD_RED") + 4),
      subjects,
      feature: [feature.cycle_step, feature.scenarios],
      unitTests: saved.scenarioUnitTests,
    }).toEqual({
      moves: ["BDD_RED > TDD_RED", "TDD_RED > CODE_GREEN", "CODE_GREEN > BDD_CHECK", "BDD_CHECK > QUALITY_GATE"],
      subjects: [`oid: checkpoint FR-A-01 BDD_RED ${SCENARIO}`, `oid: checkpoint FR-A-01 TDD_RED ${SCENARIO}`, `oid: checkpoint FR-A-01 CODE_GREEN ${SCENARIO}`, `oid: checkpoint FR-A-01 BDD_CHECK ${SCENARIO}`],
      feature: ["quality_gate", [{ name: SCENARIO, bdd: "pass" }]],
      unitTests: { [SCENARIO]: ["tests/unit/cart.test.ts > cart > adds"] },
    });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("commits the only target when its scenarios pass: one commit named after it on the run's branch, and the run is done", async () => {
    const project = loopProject();
    const agent = cartAgent();
    const { saved, log } = await approvedRun(project, agent, ["run", "--fr", "FR-A-01"]);
    const moves = log.filter((event) => event.type === "state_change").map((event) => `${event.from} > ${event.to}`);
    expect({
      moves: moves.slice(moves.indexOf("BDD_CHECK > QUALITY_GATE")),
      commits: gitIn(saved.worktree, "log", "--format=%s", `${saved.baseCommit}..HEAD`).split("\n"),
      done: JSON.parse(gitIn(saved.worktree, "show", "HEAD:progress.json")).features[0].status,
    }).toEqual({ moves: ["BDD_CHECK > QUALITY_GATE", "QUALITY_GATE > FR_COMMIT", "FR_COMMIT > DONE"], commits: ["feat(a): FR-A-01 FR-A-01"], done: "done" });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("goes on with the next target after the commit of the first, whose commit does not hold the feature file of the next", async () => {
    const project = loopProject();
    const agent = cartAgent();
    const { saved, log } = await approvedRun(project, agent);
    const next = log.find((event) => event.type === "state_change" && event.from === "FR_COMMIT");
    const [commit] = gitIn(saved.worktree, "log", "--reflog", "--topo-order", "--format=%H %s").split("\n").filter((line) => line.endsWith("feat(a): FR-A-01 FR-A-01"));
    expect({
      next: [next.to, next.reason.includes("FR-A-02")],
      files: gitIn(saved.worktree, "show", "--name-only", "--format=", commit!.split(" ")[0]!).split("\n").filter((file) => file.endsWith(".feature")),
    }).toEqual({ next: ["BDD_RED", true], files: ["features/FR-A-01.feature"] });
  }, REAL_PROCESS_TIMEOUT_MS);
});
