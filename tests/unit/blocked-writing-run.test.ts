import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { answering, approvedRun, loopProject } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, useTempDir } from "./temp-project.js";

useTempDir();

const BLOCKED = { reason: "spec_conflict", detail: "FR-A-01 contradicts FR-A-02" };

describe("a feature-writing agent that is blocked during a run", () => {
  it("is put to the person with its reason, and a retry with a note runs the agent once more with the note", async () => {
    const agent = new FakeAgent();
    agent.blockedFirst = BLOCKED;
    const { log } = await approvedRun(loopProject(), agent, ["run"], answering(["retry", "approve", "abort"], "FR-A-02 is out of scope"));
    expect({
      tasks: agent.tasks.length,
      noteInSecondTask: agent.tasks[1]?.text.includes("FR-A-02 is out of scope"),
      errors: log.filter((event) => event.type === "error" && String(event.message).includes("blocked")).length,
      moves: log.filter((event) => event.type === "state_change" && event.from === "FEATURE_WRITE").map((event) => `${event.from} > ${event.to}`),
    }).toEqual({ tasks: 3, noteInSecondTask: true, errors: 0, moves: ["FEATURE_WRITE > FEATURE_REVIEW"] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("is skipped with its feature when the person chooses skip_fr, and the run ends when no target is left", async () => {
    const agent = new FakeAgent();
    agent.blocked = BLOCKED;
    const { exitCode, saved, log } = await approvedRun(loopProject(), agent, ["run"], answering(["skip_fr", "skip_fr"]));
    const moves = log.filter((event) => event.type === "state_change" && event.from === "FEATURE_WRITE");
    expect({
      exitCode,
      state: saved.state,
      left: saved.leftFrs,
      moves: moves.map((event) => `${event.from} > ${event.to}`),
      reasonMentions: ["FR-A-01", "FR-A-02", "skipped", BLOCKED.detail].every((text) => moves[0]?.reason.includes(text)),
    }).toEqual({ exitCode: 0, state: "DONE", left: ["FR-A-01", "FR-A-02"], moves: ["FEATURE_WRITE > DONE"], reasonMentions: true });
  }, REAL_PROCESS_TIMEOUT_MS);
});
