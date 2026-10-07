import { describe, expect, it } from "vitest";
import { runInProject } from "./run-capture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

describe("oid run", () => {
  it("is a command of oid that refuses a project without a configuration file", async () => {
    const { exitCode, stdout, stderr } = await runInProject(["run"]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain(".outside-in.json is missing");
  });
});
