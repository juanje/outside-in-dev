import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { dir, useTempDir, write } from "./temp-project.js";
import { runInProject as run, summariseCheckJson } from "./run-capture.js";

useTempDir();

beforeEach(() => {
  writeConfig(["specs/features/**/*.feature"]);
});

function writeConfig(bddFeatures: string[]): void {
  const config = {
    version: 1,
    stack: "typescript",
    paths: {
      source: ["src/**"],
      shared: [],
      unit_tests: ["tests/**"],
      bdd_features: bddFeatures,
      bdd_steps: [],
      docs: [],
      spec: "specs/SPEC.md",
      design: [],
      progress: "specs/progress.json",
    },
    commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
  };
  write(".outside-in.json", JSON.stringify(config));
}

const ALPHA_PROGRESS = { current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "pending" }] };

describe("oid progress with .outside-in.json", () => {
  it("reads the progress file named by paths.progress", async () => {
    write("specs/progress.json", JSON.stringify(ALPHA_PROGRESS));
    const { exitCode, stdout } = await run(["progress", "status", "--all"]);
    expect({ exitCode, stdout }).toEqual({ exitCode: 0, stdout: "FR-X-01  Alpha  pending\n" });
  });

  it("writes changes to the progress file named by paths.progress", async () => {
    write("specs/progress.json", JSON.stringify(ALPHA_PROGRESS));
    expect((await run(["progress", "focus", "FR-X-01"])).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "specs/progress.json"), "utf8")).current_focus).toBe("FR-X-01");
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("checks added features against the spec named by paths.spec", async () => {
    write("specs/SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    write("specs/progress.json", JSON.stringify({ current_focus: null, features: [] }));
    expect((await run(["progress", "add", "FR-X-01", "Alpha"])).exitCode).toBe(0);
  });

  it("names the configured spec in the message for a requirement it does not define", async () => {
    write("specs/SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    write("specs/progress.json", JSON.stringify({ current_focus: null, features: [] }));
    expect((await run(["progress", "add", "FR-X-02", "Beta"])).stderr).toBe("error: FR-X-02 is not defined in specs/SPEC.md\n");
  });

  it("names the configured progress file in the messages about tracked features", async () => {
    write("specs/progress.json", JSON.stringify(ALPHA_PROGRESS));
    expect((await run(["progress", "show", "FR-X-09"])).stderr).toBe("error: FR-X-09 is not tracked in specs/progress.json\n");
  });

  it("names the configured progress file when a feature is already tracked", async () => {
    write("specs/SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    write("specs/progress.json", JSON.stringify(ALPHA_PROGRESS));
    expect((await run(["progress", "add", "FR-X-01", "Alpha"])).stderr).toBe("error: FR-X-01 is already tracked in specs/progress.json\n");
  });

  it("names the configured progress file when a change would make it invalid", async () => {
    write("specs/SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    write("specs/progress.json", JSON.stringify({ current_focus: null, features: [] }));
    expect((await run(["progress", "add", "FR-X-01", ""])).stderr).toMatch(/^error: specs\/progress\.json is invalid:\n/);
  });
});

const STARTED_PROGRESS = {
  current_focus: "FR-X-01",
  features: [
    {
      id: "FR-X-01",
      title: "Alpha",
      status: "in_progress",
      cycle_step: "quality_gate",
      scenarios: [{ name: "Alpha works", bdd: "pass" }],
    },
  ],
};
const ROOT_DECOY = { current_focus: null, features: [{ id: "FR-ROOT-01", title: "Decoy", status: "pending" }] };

function readSpecsProgress() {
  return JSON.parse(readFileSync(join(dir, "specs/progress.json"), "utf8"));
}

describe("oid progress subcommands with paths.progress", () => {
  beforeEach(() => {
    write("progress.json", JSON.stringify(ROOT_DECOY));
  });

  it("current reads the focused feature from the progress file named by paths.progress", async () => {
    write("specs/progress.json", JSON.stringify(STARTED_PROGRESS));
    const { exitCode, stdout } = await run(["progress", "current"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("FR-X-01");
    expect(stdout).toContain("quality_gate");
    expect(stdout).toContain("Alpha works");
    expect(stdout).not.toContain("FR-ROOT-01");
  });

  it("show reads the feature from the progress file named by paths.progress", async () => {
    write("specs/progress.json", JSON.stringify(STARTED_PROGRESS));
    const { exitCode, stdout } = await run(["progress", "show", "FR-X-01"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Alpha works");
    expect((await run(["progress", "show", "FR-ROOT-01"])).stderr).toBe("error: FR-ROOT-01 is not tracked in specs/progress.json\n");
  });

  it("step writes the new cycle step to the progress file named by paths.progress and not to the root", async () => {
    write("specs/progress.json", JSON.stringify(ALPHA_PROGRESS));
    expect((await run(["progress", "step", "FR-X-01", "select"])).exitCode).toBe(0);
    expect(readSpecsProgress().features[0]).toMatchObject({ status: "in_progress", cycle_step: "select" });
    expect(JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"))).toEqual(ROOT_DECOY);
  });

  it("scenario writes the recorded scenario to the progress file named by paths.progress and not to the root", async () => {
    write("specs/progress.json", JSON.stringify({ ...STARTED_PROGRESS, features: [{ ...STARTED_PROGRESS.features[0], scenarios: [] }] }));
    expect((await run(["progress", "scenario", "fail", "FR-X-01", "Alpha works"])).exitCode).toBe(0);
    expect(readSpecsProgress().features[0].scenarios).toEqual([{ name: "Alpha works", bdd: "fail" }]);
    expect(JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"))).toEqual(ROOT_DECOY);
  });

  it("done writes the finished feature to the progress file named by paths.progress and not to the root", async () => {
    write("specs/progress.json", JSON.stringify(STARTED_PROGRESS));
    expect((await run(["progress", "done", "FR-X-01"])).exitCode).toBe(0);
    const { current_focus, features } = readSpecsProgress();
    expect(current_focus).toBeNull();
    expect(features[0]).toEqual({ id: "FR-X-01", title: "Alpha", status: "done", scenarios: [{ name: "Alpha works", bdd: "pass" }] });
    expect(JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"))).toEqual(ROOT_DECOY);
  });
});

describe("an invalid .outside-in.json", () => {
  it.each([
    ["oid check", ["check"]],
    ["oid progress status", ["progress", "status"]],
    ["oid progress focus", ["progress", "focus", "FR-X-01"]],
  ])("makes %s fail with an error naming the violation and nothing else", async (_label, args) => {
    write("progress.json", JSON.stringify(ALPHA_PROGRESS));
    write(".outside-in.json", JSON.stringify({ version: 2 }));
    const { exitCode, stdout, stderr } = await run(args);
    expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: "" });
    expect(stderr).toMatch(/^error: \.outside-in\.json is invalid:\n.*version/);
    expect(JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"))).toEqual(ALPHA_PROGRESS);
  });

  it("makes oid check fail naming the file when it is not JSON", async () => {
    write(".outside-in.json", "{ not json");
    const { exitCode, stdout, stderr } = await run(["check"]);
    expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: "" });
    expect(stderr).toMatch(/^error: \.outside-in\.json is not valid JSON/);
  });
});

describe("oid check with .outside-in.json", () => {
  it("reads the spec named by paths.spec and names it in the violations", async () => {
    write("specs/SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n\n### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    expect(await run(["check"])).toEqual({ exitCode: 1, stdout: "specs/SPEC.md: FR-X-01: duplicate ID\n", stderr: "" });
  });

  it("reports a missing spec by the path configured in paths.spec", async () => {
    expect(await run(["check"])).toEqual({ exitCode: 1, stdout: "specs/SPEC.md not found\n", stderr: "" });
  });

  it("reads the feature files matching every glob of paths.bdd_features and no others", async () => {
    writeConfig(["specs/features/**/*.feature", "extra/*.feature"]);
    write("specs/SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    const untagged = "Feature: F\n\n  Scenario: S\n    Given g\n";
    write("specs/features/chat/a.feature", untagged);
    write("extra/b.feature", untagged);
    write("extra/deeper/c.feature", untagged);
    write("features/stray.feature", untagged);
    expect((await run(["check"])).stdout).toBe(
      "extra/b.feature: S: no @FR tag\nspecs/features/chat/a.feature: S: no @FR tag\n",
    );
  });

  it("checks the progress file named by paths.progress and names it in the violations", async () => {
    write("specs/SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
    write("specs/progress.json", JSON.stringify({ current_focus: "FR-X-09", features: [] }));
    expect((await run(["check"])).stdout).toBe("specs/progress.json: FR-X-09: focused but not tracked\n");
  });

  it("reports an invalid configuration as a config violation in the JSON document", async () => {
    write(".outside-in.json", JSON.stringify({ version: 2 }));
    const { summary, messages } = summariseCheckJson(await run(["check", "--json"]));
    expect(summary).toEqual({
      exitCode: 1,
      stderr: "",
      ok: false,
      checks: ["config"],
    });
    expect(messages[0]).toMatch(/^\.outside-in\.json is invalid:\n.*version/);
  });
});
