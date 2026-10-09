import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkpoint } from "../../src/artifacts/git-checkpoints.js";
import { startRun } from "../../src/artifacts/git-workspace.js";
import { createEventBus } from "../../src/events/bus.js";
import { commitFeature } from "../../src/orchestrator/run-commit.js";
import { featureProject } from "./feature-cycle-fixture.js";
import { gitIn } from "./git-fixture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

describe("committing a finished feature", () => {
  it("squashes its checkpoints into one commit named after it that holds it as done and leaves out the feature file of the target still to do", () => {
    const project = featureProject();
    const workspace = startRun(project, { runId: "r1" });
    const put = (file: string, text: string) => {
      mkdirSync(dirname(join(workspace.path, file)), { recursive: true });
      writeFileSync(join(workspace.path, file), text);
    };
    put("features/FR-A-01.feature", "@FR-A-01\nFeature: One\n  Scenario: Behaviour\n    Given a step\n");
    put("features/FR-A-02.feature", "@FR-A-02\nFeature: Two\n  Scenario: Other\n    Given a step\n");
    put("src/a.ts", "export const a = 1;\n");
    const progress = JSON.parse(readFileSync(join(workspace.path, "progress.json"), "utf8"));
    progress.features[0] = { ...progress.features[0], status: "in_progress", cycle_step: "quality_gate", scenarios: [{ name: "Behaviour", bdd: "pass" }] };
    put("progress.json", JSON.stringify(progress));
    checkpoint(workspace, { fr: "FR-A-01", state: "QUALITY_GATE" });
    const bus = createEventBus({ cwd: project, runId: "r1", write: () => undefined, now: () => 0 });
    const squashed = commitFeature({ cwd: project, runId: "r1", bus, workspace, targets: ["FR-A-01", "FR-A-02"] }, workspace.startCommit);
    const path = workspace.path;
    expect({
      head: gitIn(path, "rev-parse", "HEAD"),
      parent: gitIn(path, "rev-parse", "HEAD^"),
      subject: gitIn(path, "log", "-1", "--format=%s"),
      body: gitIn(path, "log", "-1", "--format=%b"),
      files: gitIn(path, "diff", "--name-only", workspace.startCommit, "HEAD").split("\n"),
      feature: JSON.parse(gitIn(path, "show", "HEAD:progress.json")).features[0],
    }).toEqual({
      head: squashed,
      parent: workspace.startCommit,
      subject: "feat(a): FR-A-01 FR-A-01",
      body: "- Behaviour",
      files: ["features/FR-A-01.feature", "progress.json", "src/a.ts"],
      feature: { id: "FR-A-01", title: "FR-A-01", status: "done", scenarios: [{ name: "Behaviour", bdd: "pass" }] },
    });
  });
});
