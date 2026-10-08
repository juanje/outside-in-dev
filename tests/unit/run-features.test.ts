import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { runCli } from "../../src/run-cli.js";
import { gitIn } from "./git-fixture.js";
import { featureProject, runServices } from "./feature-cycle-fixture.js";
import { useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

describe("writing the feature files of a run", () => {
  it("has the agent write a feature file for each target, then waits for the review of a person who cannot be asked", async () => {
    const project = featureProject();
    const io = { cwd: project, stdout: () => undefined, stderr: () => undefined };
    const exitCode = await runCli(["run"], io, runServices(new FakeAgent().sdk, { isTTY: false }));
    const saved = readJson(join(project, ".outside-in/session.json"));
    for (const id of ["FR-A-01", "FR-A-02"]) expect(existsSync(join(saved.worktree, `features/${id}.feature`))).toBe(true);
    const [run] = readdirSync(join(project, ".outside-in/runs"));
    const log = readFileSync(join(project, ".outside-in/runs", run!, "events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(log.filter((event) => event.type === "state_change").map((event) => event.to).slice(-2)).toEqual(["FEATURE_WRITE", "FEATURE_REVIEW"]);
    expect({ exitCode, state: saved.state, actions: saved.pendingInput.actions.map((action: { key: string }) => action.key) }).toEqual({ exitCode: 3, state: "FEATURE_REVIEW", actions: ["approve", "edit", "reject"] });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("ends with an error that names the requirement, the reason and the detail when the agent is blocked", async () => {
    const project = featureProject();
    const agent = new FakeAgent();
    agent.blocked = { reason: "spec_conflict", detail: "FR-A-01 contradicts FR-A-02" };
    const printed: string[] = [];
    const exitCode = await runCli(["run"], { cwd: project, stdout: (text) => printed.push(text), stderr: () => undefined }, runServices(agent.sdk, { isTTY: false }));
    const saved = readJson(join(project, ".outside-in/session.json"));
    expect({ exitCode, state: saved.state, last: printed.at(-1) }).toEqual({ exitCode: 1, state: "FEATURE_WRITE", last: "error: FR-A-01: the agent is blocked (spec_conflict): FR-A-01 contradicts FR-A-02\n" });
  });

  it("ends with an error that gives the reason when the attempt of the agent fails", async () => {
    const project = featureProject();
    const agent = new FakeAgent();
    agent.unreported = [{ path: "features/extra.feature", content: "Feature: Extra\n" }];
    const printed: string[] = [];
    const exitCode = await runCli(["run"], { cwd: project, stdout: (text) => printed.push(text), stderr: () => undefined }, runServices(agent.sdk, { isTTY: false }));
    expect({ exitCode, last: printed.at(-1) }).toEqual({ exitCode: 1, last: "error: FR-A-01: the agent failed: the report does not match the files that changed (missing files: features/extra.feature)\n" });
  });

  it("ends with an error that names the requirement when a feature file the agent wrote does not parse", async () => {
    const project = featureProject();
    const agent = new FakeAgent();
    agent.filesFor.set("FR-A-01", () => [{ path: "features/FR-A-01.feature", content: "this is not gherkin\n" }]);
    const printed: string[] = [];
    const exitCode = await runCli(["run"], { cwd: project, stdout: (text) => printed.push(text), stderr: () => undefined }, runServices(agent.sdk, { isTTY: false }));
    const saved = readJson(join(project, ".outside-in/session.json"));
    expect({ exitCode, state: saved.state }).toEqual({ exitCode: 1, state: "FEATURE_WRITE" });
    expect(printed.at(-1)).toMatch(/^error: FR-A-01: features\/FR-A-01\.feature does not parse: /);
  });

  it("asks the person once for all the targets, with the text of the feature files, the worktree and the three actions", async () => {
    const project = featureProject();
    const asked: { prompt: string; actions: string[] }[] = [];
    const input = { isTTY: true as const, choose: async (prompt: string, actions: string[]) => (asked.push({ prompt, actions }), "approve"), line: async () => "" };
    await runCli(["run"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, runServices(new FakeAgent().sdk, input));
    const { worktree } = readJson(join(project, ".outside-in/session.json"));
    expect(asked.map((question) => question.actions)).toEqual([["approve", "edit", "reject"]]);
    expect(asked[0]!.prompt).toContain(worktree);
    for (const id of ["FR-A-01", "FR-A-02"]) expect(asked[0]!.prompt).toContain(readFileSync(join(worktree, `features/${id}.feature`), "utf8"));
  });

  it("saves the hash of each feature file and no pending question when the person approves", async () => {
    const project = featureProject();
    const printed: string[] = [];
    const input = { isTTY: true as const, choose: async () => "approve", line: async () => "" };
    await runCli(["run"], { cwd: project, stdout: (text) => printed.push(text), stderr: () => undefined }, runServices(new FakeAgent().sdk, input));
    const saved = readJson(join(project, ".outside-in/session.json"));
    const hash = (id: string) => `sha256:${createHash("sha256").update(readFileSync(join(saved.worktree, `features/${id}.feature`))).digest("hex")}`;
    expect({ hashes: saved.featureHashes, pending: saved.pendingInput ?? null }).toEqual({
      hashes: { "features/FR-A-01.feature": hash("FR-A-01"), "features/FR-A-02.feature": hash("FR-A-02") },
      pending: null,
    });
    expect(printed).toContain("[FEATURE_REVIEW -> BDD_RED] the feature files are approved; BDD Red is next\n");
  });

  it("moves each target to bdd_red in the progress file of the worktree and leaves the user's copy as it was", async () => {
    const project = featureProject();
    const input = { isTTY: true as const, choose: async () => "approve", line: async () => "" };
    await runCli(["run"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, runServices(new FakeAgent().sdk, input));
    const { worktree } = readJson(join(project, ".outside-in/session.json"));
    const steps = (file: string) => readJson(file).features.map((feature: { id: string; status: string; cycle_step: string }) => [feature.id, feature.status, feature.cycle_step]);
    expect(steps(join(worktree, "progress.json"))).toEqual([["FR-A-01", "in_progress", "bdd_red"], ["FR-A-02", "in_progress", "bdd_red"]]);
    expect(steps(join(project, "progress.json"))).toEqual([["FR-A-01", "pending", undefined], ["FR-A-02", "pending", undefined]]);
  });

  it("commits the feature files and the progress update as one checkpoint that names every target", async () => {
    const project = featureProject();
    const input = { isTTY: true as const, choose: async () => "approve", line: async () => "" };
    await runCli(["run"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, runServices(new FakeAgent().sdk, input));
    const { worktree } = readJson(join(project, ".outside-in/session.json"));
    expect(gitIn(worktree, "log", "-1", "--format=%s")).toBe("oid: checkpoint FR-A-01 FR-A-02 FEATURE_REVIEW");
    expect(gitIn(worktree, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual(["features/FR-A-01.feature", "features/FR-A-02.feature", "progress.json"]);
  });

  it("commits what the person edited as a human edit, logs it and records the hash of the edited file", async () => {
    const project = featureProject();
    let worktree = "";
    const edit = async () => (appendFileSync(join(worktree, "features/FR-A-01.feature"), "\n  Scenario: Edited\n    Given a cart\n"), "");
    const input = { isTTY: true as const, choose: async (prompt: string) => ((worktree = /in (\S+)\n/.exec(prompt)![1]!), "edit"), line: edit };
    await runCli(["run"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, runServices(new FakeAgent().sdk, input));
    const saved = readJson(join(project, ".outside-in/session.json"));
    const edited = readFileSync(join(worktree, "features/FR-A-01.feature"), "utf8");
    expect(gitIn(worktree, "log", "-1", "--skip=1", "--format=%s")).toBe("oid: human edit");
    expect(gitIn(worktree, "show", "HEAD~1:features/FR-A-01.feature")).toContain("Scenario: Edited");
    expect(saved.featureHashes["features/FR-A-01.feature"]).toBe(`sha256:${createHash("sha256").update(edited).digest("hex")}`);
    const [run] = readdirSync(join(project, ".outside-in/runs"));
    const log = readFileSync(join(project, ".outside-in/runs", run!, "events.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(log.filter((event) => event.type === "human_edit")).toMatchObject([{ file: "features/FR-A-01.feature" }]);
  });

  it("writes the feature files again with the comment of the person who rejects them, then asks again", async () => {
    const project = featureProject();
    const agent = new FakeAgent();
    const answers = ["reject", "approve"];
    const input = { isTTY: true as const, choose: async () => answers.shift()!, line: async () => "Cover the empty cart" };
    const printed: string[] = [];
    await runCli(["run"], { cwd: project, stdout: (text) => printed.push(text), stderr: () => undefined }, runServices(agent.sdk, input));
    const tasksOf = (id: string) => agent.tasks.filter((task) => task.fr === id).map((task) => task.text.includes("Cover the empty cart"));
    expect({ first: tasksOf("FR-A-01"), second: tasksOf("FR-A-02"), answers }).toEqual({ first: [false, true], second: [false, true], answers: [] });
    expect(printed.filter((line) => line.startsWith("[FEATURE_REVIEW -> FEATURE_WRITE]"))).toHaveLength(1);
  });

  it("gives the agent procedural instructions that end with the report and say that it runs neither git nor tests, before the context", async () => {
    const project = featureProject();
    const agent = new FakeAgent();
    await runCli(["run"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, runServices(agent.sdk, { isTTY: false }));
    const [task] = agent.tasks;
    const instructions = task!.text.slice(0, task!.text.indexOf("Requirement:"));
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toContain("@FR-A-01");
    expect(instructions).toMatch(/does not run git or tests|do not run git or tests/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });

  it("ends with an error that names the requirement when the provider fails in a way a retry cannot fix", async () => {
    const project = featureProject();
    const agent = new FakeAgent();
    agent.providerError = "401 invalid api key";
    const printed: string[] = [];
    const exitCode = await runCli(["run"], { cwd: project, stdout: (text) => printed.push(text), stderr: () => undefined }, runServices(agent.sdk, { isTTY: false }));
    expect({ exitCode, last: printed.at(-1) }).toEqual({ exitCode: 1, last: "error: FR-A-01: the provider failed: 401 invalid api key\n" });
  });

  it("approves nothing when the answer is not one of the actions", async () => {
    const project = featureProject();
    const printed: string[] = [];
    const input = { isTTY: true as const, choose: async () => "maybe", line: async () => "" };
    const exitCode = await runCli(["run"], { cwd: project, stdout: (text) => printed.push(text), stderr: () => undefined }, runServices(new FakeAgent().sdk, input));
    const saved = readJson(join(project, ".outside-in/session.json"));
    expect({ exitCode, state: saved.state, hashes: saved.featureHashes, last: printed.at(-1) }).toEqual({ exitCode: 1, state: "FEATURE_REVIEW", hashes: undefined, last: 'error: "maybe" is not an answer to the review: use approve, edit or reject\n' });
  });

  it("holds the lock with the process id it is given and opens its agents in the agent directory it is given", async () => {
    const project = featureProject();
    const agent = new FakeAgent();
    let lock = "";
    const input = { isTTY: true as const, choose: async () => ((lock = readFileSync(join(project, ".outside-in/lock"), "utf8")), "approve"), line: async () => "" };
    await runCli(["run"], { cwd: project, stdout: () => undefined, stderr: () => undefined }, { ...runServices(agent.sdk, input), pid: 4242, agentDir: "/given/agent" });
    expect({ lock, agentDirs: [...new Set(agent.agentDirs)] }).toEqual({ lock: "4242\n", agentDirs: ["/given/agent"] });
  });
});
