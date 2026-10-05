import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(args: string[]) {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(args, {
    cwd: dir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

function writeProgress(progress: unknown) {
  writeFileSync(join(dir, "progress.json"), JSON.stringify(progress, null, 2) + "\n");
}

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
  it("fails naming progress.json when the file is missing", () => {
    const result = run(["progress", "status"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("progress.json");
  });

  it("status lists every feature with its status and cycle step", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "status"]);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/FR-X-01.*Alpha.*pending/);
    expect(lines[1]).toMatch(/FR-X-02.*Beta.*in_progress.*tdd_red/);
    expect(lines[2]).toMatch(/FR-X-03.*Gamma.*done/);
  });

  it("status marks the focused feature", () => {
    writeProgress(SAMPLE);
    const lines = run(["progress", "status"]).stdout.trimEnd().split("\n");
    expect(lines[1]).toContain("(focused)");
    expect(lines[0]).not.toContain("(focused)");
    expect(lines[2]).not.toContain("(focused)");
  });

  it("current prints the focused feature with its step and scenarios", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "current"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/FR-X-02.*Beta.*in_progress.*tdd_red/);
    expect(result.stdout).toMatch(/Beta works.*fail/);
    expect(result.stdout).toMatch(/Beta also works.*pending/);
    expect(result.stdout).not.toContain("FR-X-01");
  });

  it("current says so when no feature is focused", () => {
    writeProgress({ ...SAMPLE, current_focus: null });
    const result = run(["progress", "current"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No feature is focused");
  });

  it("show prints one feature with its scenarios", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "show", "FR-X-03"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/FR-X-03.*Gamma.*done/);
    expect(result.stdout).toMatch(/Gamma works.*pass/);
    expect(result.stdout).not.toContain("FR-X-02");
  });

  it("show fails naming a feature that is not tracked", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "show", "FR-X-99"]);
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
  it("appends a pending feature at the end", () => {
    writeSpec("FR-X-01", "FR-X-04");
    writeProgress(SAMPLE);
    const result = run(["progress", "add", "FR-X-04", "Delta"]);
    expect(result.exitCode).toBe(0);
    const features = readProgress().features;
    expect(features).toHaveLength(4);
    expect(features[3]).toEqual({ id: "FR-X-04", title: "Delta", status: "pending" });
  });

  it("refuses an id that is already tracked and leaves the file unchanged", () => {
    writeSpec("FR-X-01");
    writeProgress(SAMPLE);
    const before = readFileSync(join(dir, "progress.json"), "utf8");
    const result = run(["progress", "add", "FR-X-01", "Again"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-01");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(before);
  });

  it("refuses an id that SPEC.md does not define and leaves the file unchanged", () => {
    writeSpec("FR-X-01", "FR-X-02");
    writeProgress(SAMPLE);
    const before = readFileSync(join(dir, "progress.json"), "utf8");
    const result = run(["progress", "add", "FR-X-99", "Ghost"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-99");
    expect(result.stderr).toContain("SPEC.md");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(before);
  });
});

describe("runCli progress focus", () => {
  it("sets the focus without changing any status", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "focus", "FR-X-01"]);
    expect(result.exitCode).toBe(0);
    const progress = readProgress();
    expect(progress.current_focus).toBe("FR-X-01");
    expect(progress.features.map((f: { status: string }) => f.status)).toEqual(["pending", "in_progress", "done"]);
  });

  it("refuses an untracked id and leaves the file unchanged", () => {
    writeProgress(SAMPLE);
    const before = readFileSync(join(dir, "progress.json"), "utf8");
    const result = run(["progress", "focus", "FR-X-99"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("FR-X-99");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(before);
  });
});

describe("runCli progress step", () => {
  it("moves the feature to the next step and saves it", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "step", "FR-X-02", "tdd_green"]);
    expect(result.exitCode).toBe(0);
    expect(readProgress().features[1].cycle_step).toBe("tdd_green");
  });
});

describe("runCli progress scenario", () => {
  it("records the scenario status and saves it", () => {
    writeProgress(SAMPLE);
    const result = run(["progress", "scenario", "pass", "FR-X-02", "Beta works"]);
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

  it("marks the feature done and clears the focus when it was focused", () => {
    writeProgress({ current_focus: "FR-X-02", features: [FINISHED] });
    const result = run(["progress", "done", "FR-X-02"]);
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
  it("prints the requirement ID and the kind of each SPEC.md violation", () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\n### FR-X-02: Beta\n\nDoes beta.\n");
    const result = run(["check"]);
    expect(result.stdout).toMatch(/FR-X-01.*empty body/);
    expect(result.stdout).not.toContain("FR-X-02");
  });

  it("says there are no violations when SPEC.md is clean", () => {
    writeFileSync(join(dir, "SPEC.md"), "### FR-X-01: Alpha\n\nDoes alpha.\n");
    expect(run(["check"]).stdout).toContain("no violations");
  });
});
