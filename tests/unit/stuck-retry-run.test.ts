import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { gitIn } from "./git-fixture.js";
import { approvedRun, loopProject } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, useTempDir } from "./temp-project.js";

useTempDir();

describe("a scenario that is still red after the last iteration", () => {
  it("gets one more iteration when the person retries, and the test writer is told the note", async () => {
    const project = loopProject();
    const runner = join(project, "bdd.cjs");
    writeFileSync(runner, readFileSync(runner, "utf8").replace('located && !fs.existsSync("src/cart.ts")', "located"));
    const config = join(project, ".outside-in.json");
    writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, "utf8")), limits: { max_inner_iterations: 1 } }));
    gitIn(project, "commit", "--quiet", "--all", "--message", "the scenario stays red, one iteration at most");
    const agent = new FakeAgent();
    const round = { files: [{ path: "tests/unit/cart.test.ts", content: "// the test\n" }], test: "tests/unit/cart.test.ts > cart > adds" };
    agent.testRoute.rounds.push(round, round);
    agent.codeRoute.rounds.push({ files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
    const answers = ["approve", "retry"];
    const input = { isTTY: true as const, choose: async () => answers.shift() ?? "", line: async () => "test the second line too" };
    await approvedRun(project, agent, ["run"], input);
    const [first, second] = agent.testRoute.tasks;
    expect({ noteInFirstTask: first?.includes("test the second line too"), noteInSecondTask: second?.includes("test the second line too") }).toEqual({ noteInFirstTask: false, noteInSecondTask: true });
  }, REAL_PROCESS_TIMEOUT_MS);
});
