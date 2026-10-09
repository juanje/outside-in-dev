import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSupervised, supervisorArguments } from "../../src/artifacts/command-supervisor.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write } from "./temp-project.js";

useTempDir();

// Registered after the temporary directory's hooks, so it runs before the directory is removed: a failing test leaves no process behind.
afterEach(() => {
  for (const pid of recordedPids()) if (isRunning(pid)) process.kill(pid, "SIGKILL");
});

const LIMIT = { timeoutMs: 500, graceMs: 300 };
// For the tests that need the runner and its child to exist before the limit: starting two node processes can take longer than 500 ms under load.
const LIMIT_AFTER_START = { timeoutMs: 3000, graceMs: 300 };
const SECOND_MS = 1000;
const GONE_WITHIN_MS = 5000;
const POLL_MS = 25;
const IGNORE_SIGTERM = "process.on('SIGTERM', () => {});";

/** A runner script that records its own process id and the id of a child it starts (`node` with the given `child` code) in `pids.txt`, then waits for `behaviour`. */
function runner(name: string, { own = "", child }: { own?: string; child: string }): void {
  write(
    name,
    [
      `import { spawn } from "node:child_process";`,
      `import { appendFileSync } from "node:fs";`,
      own,
      `const child = spawn(process.execPath, ["-e", ${JSON.stringify(child)}], { stdio: "ignore" });`,
      `appendFileSync("pids.txt", process.pid + "\\n" + child.pid + "\\n");`,
      `setInterval(() => {}, ${SECOND_MS});`,
      "",
    ].join("\n"),
  );
}

const FOREVER = "setInterval(() => {}, 1000);";

function recordedPids(): number[] {
  return existsSync(join(dir, "pids.txt")) ? readFileSync(join(dir, "pids.txt"), "utf8").split("\n").filter(Boolean).map(Number) : [];
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return !/^State:\s+Z/m.test(readFileSync(`/proc/${pid}/status`, "utf8"));
  } catch {
    return false;
  }
}

async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + GONE_WITHIN_MS;
  while (!condition() && Date.now() < deadline) await new Promise((done) => setTimeout(done, POLL_MS));
}

describe("runSupervised", () => {
  it("passes the exit code and the output of a command that ends in time through unchanged", () => {
    write("quick.mjs", 'console.log("out");\nconsole.error("err");\nprocess.exit(3);\n');
    expect(runSupervised(dir, "node quick.mjs", LIMIT)).toEqual({ status: 3, stdout: "out\n", stderr: "err\n", timedOut: false });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("stops a command that passes the limit together with the child it started", () => {
    runner("hang.mjs", { child: FOREVER });
    const result = runSupervised(dir, "node hang.mjs", LIMIT_AFTER_START);
    const pids = recordedPids();
    expect({ timedOut: result.timedOut, started: pids.length, alive: pids.filter(isRunning) }).toEqual({ timedOut: true, started: 2, alive: [] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("kills a command and a child that ignore SIGTERM once the grace has passed", () => {
    runner("stubborn.mjs", { own: IGNORE_SIGTERM, child: `${IGNORE_SIGTERM}${FOREVER}` });
    const result = runSupervised(dir, "node stubborn.mjs", LIMIT_AFTER_START);
    const pids = recordedPids();
    expect({ timedOut: result.timedOut, started: pids.length, alive: pids.filter(isRunning) }).toEqual({ timedOut: true, started: 2, alive: [] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("stops the command and its child when the supervisor itself gets SIGTERM", async () => {
    runner("interrupted.mjs", { child: FOREVER });
    const supervisor = spawn(process.execPath, supervisorArguments("node interrupted.mjs", { timeoutMs: 60 * SECOND_MS, graceMs: LIMIT.graceMs }), { cwd: dir, stdio: ["ignore", "ignore", "ignore", "ignore"] });
    const ended = new Promise((done) => supervisor.on("close", done));
    await until(() => recordedPids().length === 2);
    const pids = recordedPids();
    supervisor.kill("SIGTERM");
    await ended;
    await until(() => !pids.some(isRunning));
    expect({ started: pids.length, alive: pids.filter(isRunning) }).toEqual({ started: 2, alive: [] });
  }, REAL_PROCESS_TIMEOUT_MS);
});
