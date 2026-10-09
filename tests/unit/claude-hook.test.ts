import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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

/** A project whose feature FR-X-01 is in tdd_green, with a Green verified on a change to its source, recorded in the single checkpoint that names the feature, as oid v0.6 writes it. */
function verifiedGreen(): void {
  write("src/a.ts", "export const a = 1;\n");
  write("progress.json", JSON.stringify({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "X", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] }));
  commitAll();
  write("src/a.ts", "export const a = 2;\n");
  recordCheckpoint(dir, { ...GREEN, feature: null });
  const single = join(dir, ".outside-in", "checkpoint.json");
  writeFileSync(single, JSON.stringify({ ...JSON.parse(readFileSync(single, "utf8")), feature: GREEN.feature }));
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

/** A committed project whose feature FR-X-01 is focused at `step`, with no verification recorded. */
function focusedAt(step: string): void {
  write("src/a.ts", "export const a = 1;\n");
  write("progress.json", JSON.stringify({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "X", status: "in_progress", cycle_step: step, scenarios: [] }] }));
  commitAll();
}

/** Runs the before-step hook on `command` with an `oid` whose integrity check always fails: its exit code. */
function beforeStepWithFailingIntegrity(command: string): number | null {
  write("bin/oid", '#!/bin/sh\nif [ "$1 $2" = "verify integrity" ]; then echo "src/a.ts changed source code while writing tests"; exit 1; fi\nexit 0\n');
  spawnSync("chmod", ["+x", join(dir, "bin", "oid")]);
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync(process.execPath, [HOOK, "before-step"], {
    input: JSON.stringify({ tool_input: { command } }),
    env: { ...env, CLAUDE_PROJECT_DIR: dir, PATH: `${join(dir, "bin")}:${env.PATH}` },
    encoding: "utf8",
  });
  return run.status;
}

describe("the before-step hook, by direction of the move", () => {
  it("lets a feature go back to a Red without a verification", () => {
    focusedAt("tdd_green");
    const back = ["oid progress step FR-X-01 tdd_red", "oid progress step FR-X-01 bdd_red"].map((command) => runHook("before-step", { tool_input: { command } }).status);
    expect(back).toEqual([0, 0]);
  });

  it("requires a green to move forward from refactor to quality_gate", () => {
    focusedAt("refactor");
    const { status, stderr } = runHook("before-step", { tool_input: { command: "oid progress step FR-X-01 quality_gate" } });
    expect({ status, names: stderr.includes("oid verify green") }).toEqual({ status: 2, names: true });
  });
});

describe("the before-step hook, with a checkpoint per feature", () => {
  it("reads the checkpoint of the feature, not the single checkpoint of another one", () => {
    focusedAt("tdd_green");
    write("src/a.ts", "export const a = 2;\n");
    recordCheckpoint(dir, GREEN);
    recordCheckpoint(dir, { ...GREEN, step: "tdd_red", feature: null });
    expect(runHook("before-step", STEP_TO_REFACTOR).status).toBe(0);
  });
});

describe("the before-step hook, on the command it is given", () => {
  it("takes no text in a heredoc, a comment or a quoted string for a command", () => {
    focusedAt("tdd_green");
    const texts = [
      "cat <<'EOF'\noid verify green\noid progress step FR-X-01 refactor\nEOF",
      'git commit -m "$(cat <<\'EOF\'\nrun oid verify green before oid progress step FR-X-01 refactor\nEOF\n)"',
      "echo 'oid verify green' \"oid progress step FR-X-01 refactor\"",
      "ls # oid verify green; oid progress step FR-X-01 refactor",
    ];
    expect(texts.map(beforeStepWithFailingIntegrity)).toEqual([0, 0, 0, 0]);
  });

  it("recognises the command wherever it runs in the line: after a cd, a pipe or a wrapper", () => {
    focusedAt("tdd_green");
    const commands = ["cd /tmp && oid verify green", "true | rtk proxy oid verify red x.feature:3", "NODE_OPTIONS= oid verify green"];
    expect(commands.map(beforeStepWithFailingIntegrity)).toEqual([2, 2, 2]);
  });
});

describe("the before-step hook, on revise and reopen", () => {
  it("refuses oid progress revise run by the agent, and names the human's terminal", () => {
    focusedAt("tdd_green");
    const { status, stderr } = runHook("before-step", { tool_input: { command: "cd /tmp && oid progress revise FR-X-01" } });
    expect({ status, names: stderr.includes("human in their own terminal") }).toEqual({ status: 2, names: true });
  });

  it("takes oid progress revise in a comment or a heredoc for text, and lets oid progress reopen run", () => {
    focusedAt("tdd_green");
    const commands = ["ls # oid progress revise FR-X-01", "cat <<'EOF'\noid progress revise FR-X-01\nEOF", "oid progress reopen FR-X-01"];
    expect(commands.map((command) => runHook("before-step", { tool_input: { command } }).status)).toEqual([0, 0, 0]);
  });

  it("refuses oid progress step quality_gate from bdd_red, the exit after a revise, and names the human's terminal", () => {
    focusedAt("bdd_red");
    const { status, stderr } = runHook("before-step", { tool_input: { command: "oid progress step FR-X-01 quality_gate" } });
    expect({ status, names: stderr.includes("human in their own terminal") }).toEqual({ status: 2, names: true });
  });
});

describe("the before-step hook, on --help", () => {
  it("lets oid --help or -h through without the integrity or evidence checks, because nothing runs", () => {
    focusedAt("tdd_green");
    const commands = ["oid verify green --help", "oid verify red -h", "oid progress step FR-X-01 refactor --help"];
    expect(commands.map(beforeStepWithFailingIntegrity)).toEqual([0, 0, 0]);
  });

  it("lets oid progress revise --help and the human-only exit from bdd_red through too, because with --help nothing runs", () => {
    focusedAt("bdd_red");
    const commands = ["oid progress revise --help", "oid progress step FR-X-01 quality_gate -h"];
    expect(commands.map((command) => runHook("before-step", { tool_input: { command } }).status)).toEqual([0, 0]);
  });
});
