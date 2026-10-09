import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { runCli } from "../../src/run-cli.js";
import { gitIn } from "./git-fixture.js";
import { loopProject, readJson } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, dir, useTempDir } from "./temp-project.js";

useTempDir();

const approve = { isTTY: true as const, choose: async () => "approve", line: async () => "" };

describe("the session after Code Green", () => {
  it("keeps the state of Code Green until the BDD Check, and records the checkpoint before the green for the refactor", async () => {
    const project = loopProject();
    const agent = new FakeAgent();
    agent.testRoute.rounds.push({ files: [{ path: "tests/unit/cart.test.ts", content: "// the test\n" }], test: "tests/unit/cart.test.ts > cart > adds" });
    agent.codeRoute.rounds.push({ files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
    const seen: { state: string; beforeGreen?: string }[] = [];
    const detect = () => {
      seen.push(readJson(join(project, ".outside-in/session.json")));
      return [];
    };
    await runCli(["run", "--fr", "FR-A-01"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, { sdk: agent.sdk, input: approve, pid: process.pid, agentDir: join(dir, "agent"), detect });
    const afterGreen = seen[1]!;
    const worktree = readJson(join(project, ".outside-in/session.json")).worktree as string;
    const tddRed = gitIn(worktree, "log", "--reflog", "--format=%H %s").split("\n").find((line) => line.endsWith("TDD_RED Behaviour of FR-A-01"))!.split(" ")[0];
    expect([afterGreen.state, afterGreen.beforeGreen]).toEqual(["CODE_GREEN", tddRed]);
  }, REAL_PROCESS_TIMEOUT_MS);
});
