import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { headCommit } from "../../src/artifacts/git-workspace.js";
import type { Started } from "../../src/orchestrator/begin.js";
import { acceptGuard } from "../../src/orchestrator/run-guard.js";
import { updateSession } from "../../src/orchestrator/session.js";
import { gitIn } from "./git-fixture.js";
import { loopProject } from "./loop-fixture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

type Emitted = { type: string; reason?: string };

/** Accepts a guard with this reason in a run project with one scenario and returns the events the run published. */
function accept(reason: string): Emitted[] {
  const project = loopProject();
  writeFileSync(join(project, "progress.json"), JSON.stringify({ current_focus: null, features: [{ id: "FR-A-01", title: "A", status: "in_progress", cycle_step: "bdd_red", scenarios: [{ name: "Behaviour of FR-A-01", bdd: "pending" }] }] }));
  gitIn(project, "commit", "--quiet", "--all", "--message", "the feature is at BDD Red");
  gitIn(project, "checkout", "--quiet", "-b", "oid/run-1");
  updateSession(project, { runId: "run-1", state: "BDD_RED" });
  const emitted: Emitted[] = [];
  const bus = { emit: (event: Emitted) => (emitted.push(event), undefined) };
  const started = { cwd: project, runId: "run-1", bus, workspace: { path: project, branch: "oid/run-1", startCommit: headCommit(project) }, targets: ["FR-A-01"] } as unknown as Started;
  acceptGuard(started, { name: "Behaviour of FR-A-01", names: ["Behaviour of FR-A-01"], reason });
  return emitted;
}

describe("the transition of an accepted guard", () => {
  it("drops the full stop and the trailing spaces of the person's reason where it joins more text, and keeps the reason as written in the event", () => {
    const emitted = accept("Nothing is configured.  ");
    const move = emitted.find((event) => event.type === "state_change");
    expect(move?.reason).toContain("as a guard: Nothing is configured; every scenario of FR-A-01 passes, the quality gate is next");
    expect(emitted.find((event) => event.type === "guard_accepted")?.reason).toBe("Nothing is configured.  ");
  });
});
