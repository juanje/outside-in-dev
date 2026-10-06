import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commitAll } from "./git-fixture.js";
import { runInProject } from "./run-capture.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const TARGET = "features/a.feature:3";
const STEP_FILE = "features/steps/a.steps.ts";
const RAN_MARKER = "runner-ran";

/** A project whose BDD runner leaves a marker file when it runs. */
function projectWithMarkingRunner(): void {
  writeMinimalConfig({
    commands: { bdd: "node bdd-runner.mjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
    paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
  });
  write("bdd-runner.mjs", `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(RAN_MARKER)}, "");\n`);
  commitAll();
}

describe("oid verify red <feature>:<line>", () => {
  it("rejects a step file that statically imports what does not exist yet, listing the import, without running the BDD runner", async () => {
    projectWithMarkingRunner();
    write(STEP_FILE, 'import { shout } from "../../src/shout.js";\n');
    expect(await runInProject(["verify", "red", TARGET])).toEqual({
      exitCode: 1,
      stdout: `red: not valid (test_bug): cucumber would not start, because of a static import of something that does not exist yet\n${STEP_FILE}:1 imports shout from "../../src/shout.js", which does not exist yet: import it dynamically inside the step\n`,
      stderr: "",
    });
    expect(existsSync(join(dir, RAN_MARKER))).toBe(false);
  });
});
