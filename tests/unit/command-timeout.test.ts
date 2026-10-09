import { describe, expect, it } from "vitest";
import { runCommand } from "../../src/artifacts/verify-runner.js";
import { RUNNER_COMMANDS, RUNNER_PATHS } from "./green-runners.js";
import { runInProject } from "./run-capture.js";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const HANGS = "setTimeout(() => process.exit(0), 8000);\n";
const LIMIT_KEY = "limits.command_timeout_s";

/** A project whose unit runner never ends (it gives up after 8 s, so that a missing limit does not hang the test) and whose limit is one second. */
function projectWithHangingRunner(): void {
  writeMinimalConfig({ commands: { ...RUNNER_COMMANDS, unit: "node hang-runner.mjs" }, paths: RUNNER_PATHS, limits: { command_timeout_s: 1 } });
  write("hang-runner.mjs", HANGS);
}

describe("a command that does not end", () => {
  it("is stopped at limits.command_timeout_s, and the error names the command, the limit and the key", () => {
    projectWithHangingRunner();
    expect(() => runCommand(dir, "node hang-runner.mjs")).toThrow(
      `the command "node hang-runner.mjs" did not end within 1 s and was stopped; raise ${LIMIT_KEY} in .outside-in.json if it needs more time`,
    );
  }, REAL_PROCESS_TIMEOUT_MS);

  it("makes oid verify red say the failure is the environment's, and exit 1", async () => {
    projectWithHangingRunner();
    const { exitCode, stdout } = await runInProject(["verify", "red", "tests/unit/a.test.ts > adds"]);
    expect({ exitCode, start: stdout.split("\n")[0]!.slice(0, "red: not valid (environment): the command".length), key: stdout.includes(LIMIT_KEY) }).toEqual({
      exitCode: 1,
      start: "red: not valid (environment): the command",
      key: true,
    });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("makes oid verify green exit 1 with the same error", async () => {
    projectWithHangingRunner();
    const { exitCode, stderr } = await runInProject(["verify", "green"]);
    expect({ exitCode, error: stderr.includes(`did not end within 1 s and was stopped; raise ${LIMIT_KEY}`) }).toEqual({ exitCode: 1, error: true });
  }, REAL_PROCESS_TIMEOUT_MS);
});
