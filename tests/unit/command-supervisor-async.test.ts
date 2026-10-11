import { describe, expect, it } from "vitest";
import { runSupervisedAsync } from "../../src/artifacts/command-supervisor.js";
import { hangingScript, isRunning, killRecordedProcessesAfterEach, recordedPids, until } from "./process-fixture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write } from "./temp-project.js";

useTempDir();
killRecordedProcessesAfterEach();

const LIMIT_AFTER_START = { timeoutMs: 3000, graceMs: 300 };
const NO_LIMIT = { timeoutMs: 60_000, graceMs: 300 };
/** How long an abort has to wait for the command to be reported stopped: the tool must answer at once, long before the grace of the group. */
const AT_ONCE_MS = 1500;

describe("runSupervisedAsync", () => {
  it("passes the exit code and the output of a command that ends in time through unchanged", async () => {
    write("quick.mjs", 'console.log("out");\nconsole.error("err");\nprocess.exit(3);\n');
    expect(await runSupervisedAsync(dir, "node quick.mjs", NO_LIMIT)).toEqual({ status: 3, stdout: "out\n", stderr: "err\n", timedOut: false, aborted: false });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("lets the event loop run while the command runs: a timer fires before the command ends", async () => {
    write("slow.mjs", 'setTimeout(() => console.log("done"), 600);\n');
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 100);
    const result = await runSupervisedAsync(dir, "node slow.mjs", NO_LIMIT);
    order.push("command");
    expect({ order, stdout: result.stdout }).toEqual({ order: ["timer", "command"], stdout: "done\n" });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("stops a command that passes the limit together with the child it started", async () => {
    hangingScript("hang.mjs");
    const result = await runSupervisedAsync(dir, "node hang.mjs", LIMIT_AFTER_START);
    await until(() => !recordedPids().some(isRunning));
    const pids = recordedPids();
    expect({ timedOut: result.timedOut, aborted: result.aborted, started: pids.length, alive: pids.filter(isRunning) }).toEqual({ timedOut: true, aborted: false, started: 2, alive: [] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("returns at once when the signal is aborted, and the command and its child are gone soon after", async () => {
    hangingScript("hang.mjs");
    const controller = new AbortController();
    const running = runSupervisedAsync(dir, "node hang.mjs", NO_LIMIT, controller.signal);
    await until(() => recordedPids().length === 2);
    const pids = recordedPids();
    const abortedAt = Date.now();
    controller.abort();
    const result = await running;
    const waitedMs = Date.now() - abortedAt;
    await until(() => !pids.some(isRunning));
    expect({ aborted: result.aborted, timedOut: result.timedOut, quick: waitedMs < AT_ONCE_MS, started: pids.length, alive: pids.filter(isRunning) }).toEqual({ aborted: true, timedOut: false, quick: true, started: 2, alive: [] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("starts nothing when the signal is already aborted", async () => {
    hangingScript("hang.mjs");
    const result = await runSupervisedAsync(dir, "node hang.mjs", NO_LIMIT, AbortSignal.abort());
    expect({ aborted: result.aborted, started: recordedPids().length }).toEqual({ aborted: true, started: 0 });
  }, REAL_PROCESS_TIMEOUT_MS);
});
