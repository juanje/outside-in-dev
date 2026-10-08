import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findingKey } from "../../src/artifacts/baseline.js";
import type { FindingDraft } from "../../src/artifacts/findings.js";
import { startOfRun } from "../../src/orchestrator/begin.js";
import { parseRunArgs } from "../../src/orchestrator/run-args.js";
import { committedRunProject } from "./run-fixture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

const environment = { pid: 4242, now: new Date("2026-10-02T21:30:00Z"), suffix: "a1b2", write: () => undefined };
const COMMANDS = { bdd: "node bdd.cjs", unit: "node unit.cjs", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };

describe("the baseline of a run", () => {
  it("holds the identity of the findings the detectors report in the worktree when the run starts", () => {
    const project = committedRunProject();
    const existing: FindingDraft = { category: "magic_value", file: "src/cart.ts", range: { start: 2, end: 4 }, detail: "the number 100" };
    const looked: string[] = [];
    startOfRun(project, parseRunArgs([]), environment, COMMANDS, (worktree) => {
      looked.push(worktree);
      return [existing];
    });
    const baseline = JSON.parse(readFileSync(join(project, ".outside-in/runs/2026-10-02T21-30-00Z-a1b2/baseline.json"), "utf8"));
    expect(baseline.findings).toEqual([findingKey(existing)]);
    expect(looked).toEqual([join(project, "..", ".oid-worktrees/project/2026-10-02T21-30-00Z-a1b2")]);
  });
});
