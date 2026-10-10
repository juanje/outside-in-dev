import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCommand, runTypecheck } from "../../src/artifacts/verify-runner.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("the runners that write no report", () => {
  it("run the type check and any other command without creating oid's directory of reports", () => {
    expect(runTypecheck(dir, "node -e 0 --").exitCode).toBe(0);
    expect(runCommand(dir, "node -e 0").exitCode).toBe(0);
    expect(existsSync(join(dir, ".outside-in"))).toBe(false);
  });
});
