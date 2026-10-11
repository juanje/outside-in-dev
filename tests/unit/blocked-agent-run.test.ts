import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { approvedRun, loopProject } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, useTempDir } from "./temp-project.js";

useTempDir();

describe("an agent that is blocked during a run", () => {
  it("is put to the person with its reason, and a retry with a note runs the agent once more with the note", async () => {
    const agent = new FakeAgent();
    agent.testRoute.rounds.push({ files: [{ path: "tests/unit/cart.test.ts", content: "// the test\n" }], test: "tests/unit/cart.test.ts > cart > adds" });
    agent.codeRoute.rounds.push({ files: [], blocked: { reason: "spec_gap", detail: "the rounding is not defined" } }, { files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
    const answers = ["approve", "retry"];
    const asked: string[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string) => (asked.push(prompt), answers.shift() ?? ""), line: async () => "round to the cent" };
    const { log } = await approvedRun(loopProject(), agent, ["run"], input);
    expect({
      blockedQuestions: asked.filter((prompt) => prompt.includes("the agent is blocked (spec_gap): the rounding is not defined")).length,
      tasks: agent.codeRoute.tasks.length,
      noteInSecondTask: agent.codeRoute.tasks[1]?.includes("round to the cent"),
      moves: log.filter((event) => event.type === "state_change" && event.from === "CODE_GREEN").map((event) => `${event.from} > ${event.to}`),
    }).toEqual({ blockedQuestions: 1, tasks: 2, noteInSecondTask: true, moves: ["CODE_GREEN > BDD_CHECK"] });
  }, REAL_PROCESS_TIMEOUT_MS);
});
