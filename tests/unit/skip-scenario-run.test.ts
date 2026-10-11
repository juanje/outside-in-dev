import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitIn } from "./git-fixture.js";
import { answering, approvedRun, stuckProject } from "./loop-fixture.js";
import { REAL_PROCESS_TIMEOUT_MS, useTempDir } from "./temp-project.js";

useTempDir();

const FILE = "features/FR-A-01.feature";
const SCENARIO = "Behaviour of FR-A-01";

type Move = { type: string; from?: string; to?: string; reason?: string };

/** A run of the stuck project whose human approves the feature files and then gives `answer` to the question about the stuck scenario: the saved session, the worktree, the progress file as the worktree holds it, and the move out of the state `from`. */
async function runAnswering(answer: string, from: string, args = ["run"]) {
  const { project, agent } = stuckProject();
  const { saved, log } = await approvedRun(project, agent, args, answering(["approve", answer]));
  const worktree: string = saved.worktree;
  const feature = JSON.parse(readFileSync(join(worktree, "progress.json"), "utf8")).features[0];
  const move = (log as Move[]).find((event) => event.type === "state_change" && event.from === from);
  return { saved, worktree, feature, move };
}

describe("a feature that has a skipped scenario", () => {
  it("goes through the quality gate into a wip commit that lists the skipped scenario, and stays in progress at the quality gate", async () => {
    const { saved, worktree, feature, move } = await runAnswering("skip_scenario", "FR_COMMIT");
    expect({
      subjects: gitIn(worktree, "log", "--format=%s", `${saved.baseCommit}..HEAD`).split("\n"),
      body: gitIn(worktree, "log", "-1", "--format=%b").includes(`- ${SCENARIO} (skipped: FR-A-01 "${SCENARIO}" is still red after 1 iterations of the inner loop; partial work: refs/oid/wip/${saved.runId}/FR-A-01/1)`),
      progress: [feature.status, feature.cycle_step],
      move: [move?.to, move?.reason?.includes("stays in progress")],
    }).toEqual({ subjects: ["wip(a): FR-A-01 FR-A-01"], body: true, progress: ["in_progress", "quality_gate"], move: ["BDD_RED", true] });
  }, REAL_PROCESS_TIMEOUT_MS);
});

describe("skipping the feature of a scenario that is still red after the last iteration", () => {
  it("discards its changes, puts it back to pending, leaves the branch as the run started it and ends the run, with the reason in the log", async () => {
    const { saved, worktree, feature, move } = await runAnswering("skip_fr", "BDD_CHECK", ["run", "--fr", "FR-A-01"]);
    expect({
      commits: gitIn(worktree, "rev-list", "--count", `${saved.baseCommit}..HEAD`),
      feature: { status: feature.status, step: feature.cycle_step, scenarios: feature.scenarios },
      files: [existsSync(join(worktree, FILE)), existsSync(join(worktree, "src/cart.ts"))],
      move: [move?.to, move?.reason?.includes("FR-A-01"), move?.reason?.includes("skipped"), move?.reason?.includes("still red after 1 iterations")],
      left: saved.leftFrs,
    }).toEqual({ commits: "0", feature: { status: "pending", step: undefined, scenarios: undefined }, files: [false, false], move: ["DONE", true, true, true], left: ["FR-A-01"] });
  }, REAL_PROCESS_TIMEOUT_MS);
});

describe("skipping a scenario that is still red after the last iteration", () => {
  it("tags it @wip with the hash of the file kept, keeps its work under a ref of the run, and returns the run to where the scenario started", async () => {
    const { saved, worktree, feature, move } = await runAnswering("skip_scenario", "BDD_CHECK");
    const text = readFileSync(join(worktree, FILE), "utf8");
    const [ref] = gitIn(worktree, "for-each-ref", "--format=%(refname) %(objectname)", `refs/oid/wip/${saved.runId}/FR-A-01/`).split("\n");
    expect({
      tagged: text.includes(`  @wip\n  Scenario: ${SCENARIO}`),
      hash: saved.featureHashes[FILE] === `sha256:${createHash("sha256").update(text).digest("hex")}`,
      kept: ref === undefined ? [] : gitIn(worktree, "ls-tree", "-r", "--name-only", ref.split(" ")[1]!).split("\n").filter((file) => file.startsWith("src/") || file.startsWith("tests/unit/cart")),
      files: [existsSync(join(worktree, "src/cart.ts")), existsSync(join(worktree, "tests/unit/cart.test.ts"))],
      scenario: feature.scenarios,
      move: [move?.to, move?.reason?.includes("@wip"), move?.reason?.includes("still red after 1 iterations")],
    }).toEqual({
      tagged: true,
      hash: true,
      kept: ["src/cart.ts", "tests/unit/cart.test.ts"],
      files: [false, false],
      scenario: [{ name: SCENARIO, bdd: "pending" }],
      move: ["QUALITY_GATE", true, true],
    });
  }, REAL_PROCESS_TIMEOUT_MS);
});
