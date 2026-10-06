import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dir, useTempDir } from "./temp-project.js";
import { runOid, summariseCheckJson } from "./run-capture.js";

useTempDir();

const runCheck = (...args: string[]) => runOid(["check", ...args], dir);

const SPEC = "### FR-X-01: Alpha\n\nDoes alpha.\n";

describe("oid check --json with inputs that are missing or broken", () => {
  it("reports a missing SPEC.md as a spec violation in one JSON document", async () => {
    expect(await runCheck("--json")).toEqual({
      exitCode: 1,
      stdout: `${JSON.stringify({ ok: false, violations: [{ check: "spec", message: "SPEC.md not found" }] })}\n`,
      stderr: "",
    });
  });

  it("reports a feature file with a Gherkin syntax error as a traceability violation naming the file", async () => {
    writeFileSync(join(dir, "SPEC.md"), SPEC);
    mkdirSync(join(dir, "features"));
    writeFileSync(join(dir, "features", "broken.feature"), "Feature x\n");
    const { summary, messages } = summariseCheckJson(await runCheck("--json"));
    expect(summary).toEqual({
      exitCode: 1,
      stderr: "",
      ok: false,
      checks: ["traceability"],
    });
    expect(messages[0]).toMatch(/^features\/broken\.feature: /);
  });

  it.each([
    ["does not follow the schema", JSON.stringify({ current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "pending", notes: "x" }] }), "features[0].notes"],
    ["is not valid JSON", "{ not json", "progress.json is not valid JSON"],
  ])("reports a progress file that %s as a progress violation", async (_label, content, expected) => {
    writeFileSync(join(dir, "SPEC.md"), SPEC);
    writeFileSync(join(dir, "progress.json"), content);
    const { summary, messages } = summariseCheckJson(await runCheck("--json"));
    expect(summary).toEqual({
      exitCode: 1,
      stderr: "",
      ok: false,
      checks: ["progress"],
    });
    expect(messages[0]).toContain(expected);
    expect(messages[0]).toContain("progress.json");
  });
});
