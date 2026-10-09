import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { RunStopped, settleBudget } from "../../src/orchestrator/budget-settle.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const startedOf = () => ({ cwd: dir, runId: "run-1", bus: createEventBus({ cwd: dir, runId: "run-1", write: () => undefined, now: () => 1 }), workspace: { path: dir }, targets: ["FR-A-01"] }) as unknown as Parameters<typeof settleBudget>[0];
const terminal = (answers: string[], asked: string[] = []) => ({ isTTY: true as const, choose: async (prompt: string) => (asked.push(prompt), answers.shift() ?? "abort"), line: async () => "" });
const readSession = () => JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8"));

function spent(usd: number): void {
  write(".outside-in/session.json", JSON.stringify({ runId: "run-1", state: "TDD_RED", spend: { usd, tokens: 1, byFr: { "FR-A-01": { usd, tokens: 1 } } } }));
}

describe("settleBudget", () => {
  it("asks once when the run has spent its cost limit and goes on, with the limit extended once, when the person extends", async () => {
    writeMinimalConfig({ limits: { cost_limit_usd: 0.05 } });
    spent(0.06);
    const asked: string[] = [];
    await settleBudget(startedOf(), { agentDir: "", input: terminal(["extend"], asked) }, "TDD_RED");
    expect({ asked, extensions: readSession().extensions }).toEqual({ asked: ["Budget exhausted at TDD_RED: the run has spent 0.06 dollars, and its limit is 0.05"], extensions: 1 });
  });

  it("stops the run with the exit code of the answer, 4 when the person aborts and 3 when there is no terminal, and leaves the limit as it was", async () => {
    writeMinimalConfig({ limits: { cost_limit_usd: 0.05 } });
    spent(0.06);
    const aborted = settleBudget(startedOf(), { agentDir: "", input: terminal(["abort"]) }, "TDD_RED");
    await expect(aborted).rejects.toEqual(new RunStopped(4));
    const unattended = settleBudget(startedOf(), { agentDir: "" }, "TDD_RED");
    await expect(unattended).rejects.toEqual(new RunStopped(3));
    expect(readSession().extensions).toBeUndefined();
  });
});
