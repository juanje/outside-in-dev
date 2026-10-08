import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { SCENARIO } from "./feature-cycle-fixture.js";
import { gitIn } from "./git-fixture.js";
import { approvedRun, loopProject, readJson } from "./loop-fixture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

describe("the inner loop of a run", () => {
  it("has the agents write a unit test and the code for the only scenario, checkpoints each step, records the scenario as passing and the requirement at the quality gate", async () => {
    const project = loopProject();
    const agent = new FakeAgent();
    agent.testRoute.rounds.push({ files: [{ path: "tests/unit/cart.test.ts", content: "// the test\n" }], test: "tests/unit/cart.test.ts > cart > adds" });
    agent.codeRoute.rounds.push({ files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
    const { saved, log } = await approvedRun(project, agent);
    const subjects = gitIn(saved.worktree, "log", "--format=%s").split("\n").reverse().filter((subject) => subject.startsWith("oid: checkpoint FR-A-01") && subject.endsWith(SCENARIO));
    const feature = readJson(join(saved.worktree, "progress.json")).features[0];
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
  });
});
