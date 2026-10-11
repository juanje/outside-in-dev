import { describe, expect, it } from "vitest";
import { answering, approvedRun, stuckProject } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, useTempDir } from "./temp-project.js";

useTempDir();

describe("a scenario that is still red after the last iteration", () => {
  it("gets one more iteration when the person retries, and the test writer is told the note", async () => {
    const { project, agent } = stuckProject();
    agent.testRoute.rounds.push(agent.testRoute.rounds[0]!);
    await approvedRun(project, agent, ["run"], answering(["approve", "retry"], "test the second line too"));
    const [first, second] = agent.testRoute.tasks;
    expect({ noteInFirstTask: first?.includes("test the second line too"), noteInSecondTask: second?.includes("test the second line too") }).toEqual({ noteInFirstTask: false, noteInSecondTask: true });
  }, REAL_PROCESS_TIMEOUT_MS);
});
