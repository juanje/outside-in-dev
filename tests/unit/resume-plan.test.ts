import { describe, expect, it } from "vitest";
import { resumePlan } from "../../src/orchestrator/resume.js";
import type { RunSession } from "../../src/orchestrator/session.js";

const BASE: RunSession = { runId: "run-1", worktree: "/w", branch: "oid/run-1", baseCommit: "base", state: "BDD_RED", targetFrs: ["FR-A-01", "FR-A-02"] };
const IN_LOOP: Partial<RunSession> = {
  fr: "FR-A-01",
  scenario: { index: 0, name: "Add a line", location: "features/FR-A-01.feature:3" },
  scenarioFailure: "addLine is not a function",
  unitRed: { tests: ["tests/unit/cart.test.ts"], failure: "Cannot find module" },
  beforeGreen: "tdd-red-checkpoint",
  innerIteration: 2,
};

describe("where a resumed run goes on", () => {
  it("re-enters the refactor with the scenario, what TDD Red handed on, the checkpoint before the green and the iteration", () => {
    const plan = resumePlan({ ...BASE, ...IN_LOOP, state: "REFACTOR" }, []);
    expect(plan).toEqual({
      targets: ["FR-A-01", "FR-A-02"],
      featureStart: "base",
      entry: {
        state: "REFACTOR",
        red: { current: { file: "features/FR-A-01.feature", line: 3, name: "Add a line" }, label: 'FR-A-01 "Add a line"', failure: "addLine is not a function" },
        unitRed: { tests: ["tests/unit/cart.test.ts"], failure: "Cannot find module" },
        beforeGreen: "tdd-red-checkpoint",
        iteration: 2,
      },
    });
  });

  it("runs a quality fix again from the start of the quality gate", () => {
    expect(resumePlan({ ...BASE, state: "QUALITY_FIX" }, [])).toEqual({ targets: ["FR-A-01", "FR-A-02"], featureStart: "base", entry: { state: "QUALITY_GATE" } });
  });

  it("hands the next feature the commit of the one committed before it, and leaves the committed one out", () => {
    expect(resumePlan({ ...BASE, state: "BDD_RED", fr: "FR-A-01", featureStart: "feat-a-01" }, ["FR-A-01"])).toEqual({ targets: ["FR-A-02"], featureStart: "feat-a-01", entry: { state: "BDD_RED" } });
  });

  it("makes the commit of a feature again from where it started, even when the feature is done in the worktree", () => {
    expect(resumePlan({ ...BASE, state: "FR_COMMIT", fr: "FR-A-01", featureStart: "base" }, ["FR-A-01"])).toEqual({ targets: ["FR-A-01", "FR-A-02"], featureStart: "base", entry: { state: "FR_COMMIT" } });
  });

  it("puts the written feature files to the review again, or writes them again with the comment of the rejection", () => {
    expect(resumePlan({ ...BASE, state: "FEATURE_REVIEW", featureFiles: ["features/a.feature"] }, [])).toEqual({ targets: ["FR-A-01", "FR-A-02"], review: { files: ["features/a.feature"] } });
    expect(resumePlan({ ...BASE, state: "FEATURE_WRITE", reviewComment: "Cover the empty cart" }, [])).toEqual({ targets: ["FR-A-01", "FR-A-02"], review: { comment: "Cover the empty cart" } });
  });
});
