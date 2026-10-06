import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { dir, useTempDir } from "./temp-project.js";
import { runOid } from "./run-capture.js";

useTempDir();

beforeEach(() => {
  writeFileSync(join(dir, "tsconfig.json"), "{}");
});

const runImport = () => runOid(["init", "--import-progress"], dir);

describe("oid init --import-progress", () => {
  it("fails without a progress file and writes nothing", async () => {
    const { exitCode, stderr } = await runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("progress.json not found");
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("reports the violations of an invalid converted progress and writes nothing", async () => {
    const original = JSON.stringify({ current_focus: null, features: [{ id: "FR-1", title: "A", status: "pending" }] });
    writeFileSync(join(dir, "progress.json"), original);
    writeFileSync(join(dir, ".gitignore"), "dist/\n");
    const { exitCode, stderr } = await runImport();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("features[0].id");
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("dist/\n");
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(original);
  });

  it("converts the progress file in place, lists what changed and still writes the configuration", async () => {
    writeFileSync(
      join(dir, "progress.json"),
      JSON.stringify({
        current_focus: null,
        features: [{ id: "FR-DEMO-01", title: "A", status: "blocked", note: "later" }],
      }),
    );
    const { exitCode, stdout } = await runImport();
    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"))).toEqual({
      current_focus: null,
      features: [{ id: "FR-DEMO-01", title: "A", status: "pending" }],
    });
    expect(stdout).toContain("FR-DEMO-01: status blocked converted to pending");
    expect(stdout).toContain("FR-DEMO-01: note later dropped");
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(true);
  });

  it("leaves a progress file that is already in the current schema untouched and says so", async () => {
    const original = '{"current_focus":null,"features":[{"id":"FR-DEMO-01","title":"A","status":"pending"}]}';
    writeFileSync(join(dir, "progress.json"), original);
    const { exitCode, stdout } = await runImport();
    expect(exitCode).toBe(0);
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(original);
    expect(stdout).toContain("progress.json is already in the current schema");
  });

  it.each([
    ["a feature that is null", { current_focus: null, features: [null] }, "features[0]"],
    [
      "a scenario that is null",
      {
        current_focus: null,
        features: [{ id: "FR-X-01", title: "A", status: "in_progress", cycle_step: "select", scenarios: [null] }],
      },
      "features[0].scenarios[0]",
    ],
    [
      "scenarios that are not a list",
      {
        current_focus: null,
        features: [{ id: "FR-X-01", title: "A", status: "in_progress", cycle_step: "select", scenarios: "none" }],
      },
      "features[0].scenarios",
    ],
  ])("reports %s as a schema violation with its path and writes nothing", async (_label, document, path) => {
    const original = JSON.stringify(document);
    writeFileSync(join(dir, "progress.json"), original);
    const { exitCode, stdout, stderr } = await runImport();
    expect({ exitCode, stdout }).toEqual({ exitCode: 1, stdout: "" });
    expect(stderr).toMatch(/^error: progress\.json is invalid:\n/);
    expect(stderr).toContain(`${path}`);
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(original);
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });
});
