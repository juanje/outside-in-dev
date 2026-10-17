import { describe, expect, it } from "vitest";
import { TRY_LIMIT_MS, tryTool } from "../../src/agents/tools/try.js";
import { REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { hangingScript, isRunning, killRecordedProcessesAfterEach, recordedPids, until } from "./process-fixture.js";
import { printedParts } from "./rejection-fixture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();
killRecordedProcessesAfterEach();

const TARGET = "tests/a.test.ts > adds up";
/** The limit the tests give the tool: long enough for a script to start and record its processes, short enough to keep the test fast. */
const SHORT_LIMIT_MS = 2500;
/** How long the tool may take to answer after the session is aborted: far less than the grace a stopped group is given. */
const AT_ONCE_MS = 1500;

/** What the tool answers when a check passed the limit: what happened, the target, and what to check instead. */
function tookTooLong(limit: string): string {
  return printedParts(
    `Your check took longer than ${limit} and was stopped`,
    `target: ${TARGET}`,
    "check a smaller target (one test or one scenario) or fix what hangs (a test that never ends, a watch mode), then try again",
  );
}

/** The text of what the tool answered. */
type Answer = { content: Array<{ type: string; text?: string }> };
function textOf(result: Answer): string {
  return result.content.map((part) => part.text ?? "").join("");
}

/** Runners whose unit test is the project's unit command, which hangs: a script that records its processes. */
function hangingRunners(): Runners {
  writeMinimalConfig({ commands: { bdd: "b", unit: "node hang.mjs", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] } });
  hangingScript("hang.mjs");
  return REAL_RUNNERS;
}

function execute(runners: Runners, limitMs: number | undefined, signal?: AbortSignal): Promise<Answer> {
  return tryTool({ worktree: dir, runners, limitMs }).execute("call-1", { target: TARGET } as never, signal, undefined, {} as never) as Promise<Answer>;
}

describe("tryTool limits", () => {
  it("has a limit of its own of 30 seconds, a small multiple of the slowest check measured in this project (8 s)", () => {
    expect(TRY_LIMIT_MS).toBe(30_000);
  });

  it("stops a check that takes longer than its limit, says so in plain words, and leaves no process behind", async () => {
    const runners = hangingRunners();
    const answer = textOf(await execute(runners, SHORT_LIMIT_MS));
    await until(() => !recordedPids().some(isRunning));
    const pids = recordedPids();
    expect(answer).toBe(tookTooLong("2.5 seconds"));
    expect({ started: pids.length, alive: pids.filter(isRunning) }).toEqual({ started: 2, alive: [] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("returns at once when the session is aborted, and stops the check and its processes", async () => {
    const runners = hangingRunners();
    const controller = new AbortController();
    const running = execute(runners, undefined, controller.signal);
    await until(() => recordedPids().length === 2);
    const pids = recordedPids();
    const abortedAt = Date.now();
    controller.abort();
    const answer = textOf(await running);
    const waitedMs = Date.now() - abortedAt;
    await until(() => !pids.some(isRunning));
    expect({ answer, quick: waitedMs < AT_ONCE_MS, alive: pids.filter(isRunning) }).toEqual({ answer: "The check was stopped because the session was stopped.", quick: true, alive: [] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("returns at once when the session is aborted even if a runner ignores the signal and never ends", async () => {
    writeMinimalConfig();
    const stuck: Runners = { ...REAL_RUNNERS, tryUnitTest: () => new Promise(() => {}) };
    const controller = new AbortController();
    const running = execute(stuck, undefined, controller.signal);
    setTimeout(() => controller.abort(), 50);
    expect(textOf(await running)).toBe("The check was stopped because the session was stopped.");
  });

  it("answers at the limit even if a runner ignores the signal and never ends", async () => {
    writeMinimalConfig();
    const stuck: Runners = { ...REAL_RUNNERS, tryUnitTest: () => new Promise(() => {}) };
    expect(textOf(await execute(stuck, 200))).toBe(tookTooLong("0.2 seconds"));
  });

  it("lets the event loop run while it checks: a timer fires before the answer", async () => {
    writeMinimalConfig();
    const slow: Runners = {
      ...REAL_RUNNERS,
      tryUnitTest: () => new Promise((done) => setTimeout(() => done({ exitCode: 0, report: undefined, stderr: "" }), 300)),
      tryTypecheck: () => ({ exitCode: 0, output: "" }),
    };
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 50);
    await execute(slow, undefined);
    order.push("answer");
    expect(order).toEqual(["timer", "answer"]);
  });
});
