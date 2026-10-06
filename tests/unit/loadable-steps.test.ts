import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadableStepsProblems, missingStaticImports } from "../../src/artifacts/loadable-steps.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";
import { parseProjectConfig } from "../../src/artifacts/project-config.js";

useTempDir();

const STEP_FILE = "features/steps/a.steps.ts";
const inSource = (path: string): boolean => path.startsWith("src/");

describe("missingStaticImports", () => {
  it("finds a static import of a source module that does not exist yet, with its line", () => {
    write(STEP_FILE, 'import { Given } from "@cucumber/cucumber";\nimport { shout } from "../../src/shout.js";\n');
    expect(missingStaticImports(dir, STEP_FILE, inSource)).toEqual([{ file: STEP_FILE, line: 2, name: "shout", specifier: "../../src/shout.js" }]);
  });

  it("finds a name that an existing module does not export, and lets the names it exports through, re-exports included", () => {
    write("src/greeting.ts", "export function greet(): string { return 'hi'; }\n");
    write("src/index.ts", 'export * from "./greeting.js";\n');
    write(STEP_FILE, 'import { greet, shout } from "../../src/index.js";\n');
    expect(missingStaticImports(dir, STEP_FILE, inSource)).toEqual([{ file: STEP_FILE, line: 1, name: "shout", specifier: "../../src/index.js" }]);
  });
});

describe("loadableStepsProblems", () => {
  it("lists, one line per import, what the step files changed since the last commit import that does not exist yet, and leaves unchanged files alone", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("features/steps/old.steps.ts", 'import { gone } from "../../src/gone.js";\n');
    commitAll();
    write("features/steps/new.steps.ts", 'import { Given } from "@cucumber/cucumber";\nimport { shout } from "../../src/shout.js";\n');
    const config = parseProjectConfig(JSON.parse(readFileSync(join(dir, ".outside-in.json"), "utf8")));
    expect(loadableStepsProblems(dir, config)).toEqual([
      'features/steps/new.steps.ts:2 imports shout from "../../src/shout.js", which does not exist yet: import it dynamically inside the step',
    ]);
  });
});
