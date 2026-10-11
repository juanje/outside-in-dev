import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { approvedRun, loopProject } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, useTempDir } from "./temp-project.js";

useTempDir();

const TEST_FILE = "tests/unit/cart.test.ts";
const TEST = "tests/unit/cart.test.ts > cart > adds";

describe("rewriting the last unit test", () => {
  it("rolls the run back to before that test, drops it from the session and has the test written again with the note", async () => {
    const agent = new FakeAgent();
    agent.testRoute.rounds.push({ files: [{ path: TEST_FILE, content: "// the first test\n" }], test: TEST }, { files: [{ path: TEST_FILE, content: "// the second test\n" }], test: TEST });
    agent.codeRoute.rounds.push({ files: [], blocked: { reason: "spec_gap", detail: "the rounding is not defined" } }, { files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
    const answers = ["approve", "rewrite"];
    const input = { isTTY: true as const, choose: async () => answers.shift() ?? "", line: async () => "do not test the rounding" };
    const { saved, log } = await approvedRun(loopProject(), agent, ["run"], input);
    const rewrite = log.find((event) => event.type === "state_change" && event.from === "CODE_GREEN" && event.to === "TDD_RED");
    expect({
      tests: agent.testRoute.tasks.length,
      noteInSecondTask: agent.testRoute.tasks[1]?.includes("do not test the rounding"),
      reason: [rewrite?.reason?.includes("written again"), rewrite?.reason?.includes("the rounding is not defined")],
      file: readFileSync(join(saved.worktree, TEST_FILE), "utf8"),
      unitTests: Object.values(saved.scenarioUnitTests),
    }).toEqual({ tests: 2, noteInSecondTask: true, reason: [true, true], file: "// the second test\n", unitTests: [[TEST]] });
  }, REAL_PROCESS_TIMEOUT_MS);
});
