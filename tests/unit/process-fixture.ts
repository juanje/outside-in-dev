import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach } from "vitest";
import { dir, write } from "./temp-project.js";

const GONE_WITHIN_MS = 5000;
const POLL_MS = 25;

/** The process ids a script of the test recorded, one on each line of `pids.txt` in the temporary project. */
export function recordedPids(): number[] {
  return existsSync(join(dir, "pids.txt")) ? readFileSync(join(dir, "pids.txt"), "utf8").split("\n").filter(Boolean).map(Number) : [];
}

/** Writes a script that records its own process id and the id of a child it starts in `pids.txt`, then waits for ever. */
export function hangingScript(name: string): void {
  write(
    name,
    [
      `import { spawn } from "node:child_process";`,
      `import { appendFileSync } from "node:fs";`,
      `const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], { stdio: "ignore" });`,
      `appendFileSync("pids.txt", process.pid + "\\n" + child.pid + "\\n");`,
      `setInterval(() => {}, 1000);`,
      "",
    ].join("\n"),
  );
}

/** Whether the process is alive (a zombie that only waits to be reaped is not). */
export function isRunning(pid: number): boolean {
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

/** Waits until the condition holds, for at most `GONE_WITHIN_MS`. */
export async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + GONE_WITHIN_MS;
  while (!condition() && Date.now() < deadline) await new Promise((done) => setTimeout(done, POLL_MS));
}

/** Registers the hook that kills every recorded process after each test, so a failing test leaves none behind. Call it after `useTempDir()`, so that it runs before the directory is removed. */
export function killRecordedProcessesAfterEach(): void {
  afterEach(() => {
    for (const pid of recordedPids()) if (isRunning(pid)) process.kill(pid, "SIGKILL");
  });
}
