import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dir, useTempDir, writeProgressFile } from "./temp-project.js";
import { runInProject as run } from "./run-capture.js";

useTempDir();

const SAMPLE = {
  current_focus: "FR-X-02",
  features: [
    { id: "FR-X-01", title: "Alpha", status: "pending" },
    {
      id: "FR-X-02",
      title: "Beta",
      status: "in_progress",
      cycle_step: "tdd_red",
      scenarios: [
        { name: "Beta works", bdd: "fail" },
        { name: "Beta also works", bdd: "pending" },
      ],
    },
    { id: "FR-X-03", title: "Gamma", status: "done", scenarios: [{ name: "Gamma works", bdd: "pass" }] },
  ],
};

describe("runCli progress", () => {
  it("fails naming progress.json when the file is missing", async () => {
    const result = await run(["progress", "status"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("progress.json");
  });

  it("status lists every feature with its status and cycle step", async () => {
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "status", "--all"]);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/FR-X-01.*Alpha.*pending/);
    expect(lines[1]).toMatch(/FR-X-02.*Beta.*in_progress.*tdd_red/);
    expect(lines[2]).toMatch(/FR-X-03.*Gamma.*done/);
  });

  it("status marks the focused feature", async () => {
    writeProgressFile(SAMPLE);
    const lines = (await run(["progress", "status", "--all"])).stdout.trimEnd().split("\n");
    expect(lines[1]).toContain("(focused)");
    expect(lines[0]).not.toContain("(focused)");
    expect(lines[2]).not.toContain("(focused)");
  });

  it("current prints the focused feature with its step and scenarios", async () => {
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "current"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/FR-X-02.*Beta.*in_progress.*tdd_red/);
    expect(result.stdout).toMatch(/Beta works.*fail/);
    expect(result.stdout).toMatch(/Beta also works.*pending/);
    expect(result.stdout).not.toContain("FR-X-01");
  });

  it("current says so when no feature is focused", async () => {
    writeProgressFile({ ...SAMPLE, current_focus: null });
    const result = await run(["progress", "current"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No feature is focused");
  });

  it("show prints one feature with its scenarios", async () => {
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "show", "FR-X-03"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/FR-X-03.*Gamma.*done/);
    expect(result.stdout).toMatch(/Gamma works.*pass/);
    expect(result.stdout).not.toContain("FR-X-02");
  });

  it("show fails naming a feature that is not tracked", async () => {
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "show", "FR-X-99"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-99");
  });
});

function writeSpec(...ids: string[]) {
  const sections = ids.map((id) => `### ${id}: Title of ${id}\n\nDescription of ${id}.\n`);
  writeFileSync(join(dir, "SPEC.md"), `# Spec\n\n${sections.join("\n")}`);
}

function readProgress() {
  return JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"));
}

describe("runCli progress add", () => {
  it("appends a pending feature at the end", async () => {
    writeSpec("FR-X-01", "FR-X-04");
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "add", "FR-X-04", "Delta"]);
    expect(result.exitCode).toBe(0);
    const features = readProgress().features;
    expect(features).toHaveLength(4);
    expect(features[3]).toEqual({ id: "FR-X-04", title: "Delta", status: "pending" });
  });

  it("refuses an id that is already tracked and leaves the file unchanged", async () => {
    writeSpec("FR-X-01");
    writeProgressFile(SAMPLE);
    const before = readFileSync(join(dir, "progress.json"), "utf8");
    const result = await run(["progress", "add", "FR-X-01", "Again"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-01");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(before);
  });

  it("refuses an id that SPEC.md does not define and leaves the file unchanged", async () => {
    writeSpec("FR-X-01", "FR-X-02");
    writeProgressFile(SAMPLE);
    const before = readFileSync(join(dir, "progress.json"), "utf8");
    const result = await run(["progress", "add", "FR-X-99", "Ghost"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-99");
    expect(result.stderr).toContain("SPEC.md");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(before);
  });
});

describe("runCli progress focus", () => {
  it("sets the focus without changing any status", async () => {
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "focus", "FR-X-01"]);
    expect(result.exitCode).toBe(0);
    const progress = readProgress();
    expect(progress.current_focus).toBe("FR-X-01");
    expect(progress.features.map((f: { status: string }) => f.status)).toEqual(["pending", "in_progress", "done"]);
  });

  it("refuses an untracked id and leaves the file unchanged", async () => {
    writeProgressFile(SAMPLE);
    const before = readFileSync(join(dir, "progress.json"), "utf8");
    const result = await run(["progress", "focus", "FR-X-99"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-99");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(before);
  });
});

describe("runCli progress step", () => {
  it("moves the feature to the next step and saves it", async () => {
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "step", "FR-X-02", "tdd_green"]);
    expect(result.exitCode).toBe(0);
    expect(readProgress().features[1].cycle_step).toBe("tdd_green");
  });
});

describe("runCli progress scenario", () => {
  it("records the scenario status and saves it", async () => {
    writeProgressFile(SAMPLE);
    const result = await run(["progress", "scenario", "pass", "FR-X-02", "Beta works"]);
    expect(result.exitCode).toBe(0);
    expect(readProgress().features[1].scenarios[0]).toEqual({ name: "Beta works", bdd: "pass" });
  });
});

describe("runCli progress done", () => {
  const FINISHED = {
    id: "FR-X-02",
    title: "Beta",
    status: "in_progress",
    cycle_step: "quality_gate",
    scenarios: [{ name: "Beta works", bdd: "pass" }],
  };

  it("marks the feature done and clears the focus when it was focused", async () => {
    writeProgressFile({ current_focus: "FR-X-02", features: [FINISHED] });
    const result = await run(["progress", "done", "FR-X-02"]);
    expect(result.exitCode).toBe(0);
    const progress = readProgress();
    expect(progress.current_focus).toBeNull();
    expect(progress.features[0]).toEqual({
      id: "FR-X-02",
      title: "Beta",
      status: "done",
      scenarios: [{ name: "Beta works", bdd: "pass" }],
    });
  });
});

describe("runCli check", () => {
  it("prints the requirement ID and the kind of each SPEC.md violation", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\n### FR-X-02: Beta\n\nDoes beta.\n");
    const result = await run(["check"]);
    expect(result.stdout).toMatch(/FR-X-01.*empty body/);
    expect(result.stdout).not.toContain("FR-X-02");
  });

  it("exits 1 when there is a violation", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n");
    expect((await run(["check"])).exitCode).toBe(1);
  });

  it("prints a single JSON document with the SPEC.md violation and exits 1 under --json", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n");
    const result = await run(["check", "--json"]);
    const report = JSON.parse(result.stdout);
    expect(report.ok).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].check).toBe("spec");
    expect(report.violations[0].message).toMatch(/FR-X-01.*empty body/);
    expect(result.exitCode).toBe(1);
  });

  it("labels a feature file violation as traceability under --json", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    mkdirSync(join(dir, "features"), { recursive: true });
    writeFileSync(join(dir, "features/alpha.feature"), "Feature: Alpha\n\n  Scenario: Orphan alpha\n");
    const { violations } = JSON.parse((await run(["check", "--json"])).stdout);
    expect(violations).toHaveLength(1);
    expect(violations[0].check).toBe("traceability");
    expect(violations[0].message).toContain("Orphan alpha");
  });

  it("labels progress.json violations as progress under --json", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    writeProgressFile({ current_focus: "FR-X-01", features: [] });
    const { violations } = JSON.parse((await run(["check", "--json"])).stdout);
    expect(violations).toHaveLength(1);
    expect(violations[0].check).toBe("progress");
    expect(violations[0].message).toContain("FR-X-01");
  });

  it("prints ok with no violations and exits 0 under --json when the project is clean", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    const result = await run(["check", "--json"]);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, violations: [] });
    expect(result.exitCode).toBe(0);
  });

  it("says there are no violations when SPEC.md is clean", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    expect((await run(["check"])).stdout).toContain("no violations");
  });
});

describe("oid check traceability", () => {
  it("reports an untraced scenario from the feature files, naming file and scenario", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    mkdirSync(join(dir, "features/nested"), { recursive: true });
    writeFileSync(join(dir, "features/nested/alpha.feature"), "Feature: Alpha\n\n  Scenario: Orphan alpha\n");
    const { stdout } = await run(["check"]);
    expect(stdout).toContain("features/nested/alpha.feature");
    expect(stdout).toContain("Orphan alpha");
    expect(stdout).not.toContain("no violations");
  });
});

describe("oid check progress consistency", () => {
  it("reports progress that contradicts the feature files, naming feature and scenario", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    mkdirSync(join(dir, "features"), { recursive: true });
    writeFileSync(join(dir, "features/alpha.feature"), "@FR-X-01\nFeature: Alpha\n\n  Scenario: Real alpha\n");
    writeProgressFile({
      current_focus: null,
      features: [
        {
          id: "FR-X-01",
          title: "Alpha",
          status: "in_progress",
          cycle_step: "tdd_red",
          scenarios: [{ name: "Ghost alpha", bdd: "fail" }],
        },
      ],
    });
    const { stdout } = await run(["check"]);
    expect(stdout).toMatch(/FR-X-01.*Ghost alpha/);
    expect(stdout).not.toContain("Real alpha");
    expect(stdout).not.toContain("no violations");
  });

  it("reports an invalid progress file with its schema message instead of crashing", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    writeProgressFile({
      current_focus: null,
      features: [{ id: "FR-X-01", title: "Alpha", status: "pending", notes: "x" }],
    });
    const result = await run(["check"]);
    expect(result.stdout).toContain("progress.json");
    expect(result.stdout).toContain("features[0].notes");
    expect(result.stdout).not.toContain("no violations");
  });

  it("reports a progress file that is not valid JSON instead of crashing", async () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    writeFileSync(join(dir, "progress.json"), "{ not json");
    const result = await run(["check"]);
    expect(result.stdout).toContain("progress.json is not valid JSON");
    expect(result.stdout).not.toContain("no violations");
  });
});
