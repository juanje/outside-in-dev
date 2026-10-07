import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const HOOK = join(import.meta.dirname, "..", "..", "scripts", "claude-hook.mjs");
const GREEN = { step: "tdd_green", feature: "FR-X-01", verify: { kind: "green", target: "all" }, external: false, date: new Date(0) };
const STEP_TO_REFACTOR = { tool_input: { command: "oid progress step FR-X-01 refactor" } };

/** Runs the hook in the temporary project with `input` on stdin: its exit code and what it printed on stderr. */
function runHook(mode: string, input: unknown): { status: number | null; stderr: string } {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync(process.execPath, [HOOK, mode], { input: JSON.stringify(input), env: { ...env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });
  return { status: run.status, stderr: run.stderr };
}

/** A project whose feature FR-X-01 is in tdd_green, with a Green verified on a change to its source. */
function verifiedGreen(): void {
  write("src/a.ts", "export const a = 1;\n");
  write("progress.json", JSON.stringify({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "X", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] }));
  commitAll();
  write("src/a.ts", "export const a = 2;\n");
  recordCheckpoint(dir, GREEN);
}

describe("the before-step hook", () => {
  it("refuses to leave a step when the code changed after its verification passed", () => {
    verifiedGreen();
    write("src/a.ts", "export const a = 3;\n");
    const { status, stderr } = runHook("before-step", STEP_TO_REFACTOR);
    expect({ status, names: stderr.includes("src/a.ts") }).toEqual({ status: 2, names: true });
  });

  it("lets the step go when nothing but the progress file changed since the verification", () => {
    verifiedGreen();
    write("progress.json", JSON.stringify({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "X", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "s", bdd: "pass" }] }] }));
    expect(runHook("before-step", STEP_TO_REFACTOR).status).toBe(0);
  });

  it("checks the integrity of the change before a new verification replaces the checkpoint, and refuses it when integrity fails", () => {
    verifiedGreen();
    write("bin/oid", '#!/bin/sh\nif [ "$1 $2" = "verify integrity" ]; then echo "tests/unit/a.test.ts changed a test while writing code"; exit 1; fi\nexit 0\n');
    spawnSync("chmod", ["+x", join(dir, "bin", "oid")]);
    const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
    const run = spawnSync(process.execPath, [HOOK, "before-step"], {
      input: JSON.stringify({ tool_input: { command: "oid verify green" } }),
      env: { ...env, CLAUDE_PROJECT_DIR: dir, PATH: `${join(dir, "bin")}:${env.PATH}` },
      encoding: "utf8",
    });
    expect({ status: run.status, reported: run.stderr.includes("changed a test while writing code") }).toEqual({ status: 2, reported: true });
  });
});
