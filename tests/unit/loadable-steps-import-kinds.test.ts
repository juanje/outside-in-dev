import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadableStepsProblems, missingStaticImports } from "../../src/artifacts/loadable-steps.js";
import { parseProjectConfig } from "../../src/artifacts/project-config.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

const STEP_FILE = "features/steps/a.steps.ts";
const inSource = (path: string): boolean => path.startsWith("src/");

describe("missingStaticImports with default, namespace and side-effect imports", () => {
  it("finds a default import of a source module that does not exist yet, and of one with no default export", () => {
    write("src/greeting.ts", "export function greet(): string { return 'hi'; }\n");
    write(STEP_FILE, 'import shout from "../../src/shout.js";\nimport greeting from "../../src/greeting.js";\n');
    expect(missingStaticImports(dir, STEP_FILE, inSource)).toEqual([
      { file: STEP_FILE, line: 1, name: "default", specifier: "../../src/shout.js" },
      { file: STEP_FILE, line: 2, name: "default", specifier: "../../src/greeting.js" },
    ]);
  });

  it("finds a namespace or side-effect import of a source module that does not exist yet, with no name, and lets those of existing modules through", () => {
    write("src/greeting.ts", "export function greet(): string { return 'hi'; }\n");
    write(STEP_FILE, 'import * as shout from "../../src/shout.js";\nimport "../../src/setup.js";\nimport * as greeting from "../../src/greeting.js";\n');
    expect(missingStaticImports(dir, STEP_FILE, inSource)).toEqual([
      { file: STEP_FILE, line: 1, specifier: "../../src/shout.js" },
      { file: STEP_FILE, line: 2, specifier: "../../src/setup.js" },
    ]);
  });
});

describe("loadableStepsProblems with an import of a whole module", () => {
  it("names the module alone when the import needs no name from it", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    commitAll();
    write(STEP_FILE, 'import "../../src/setup.js";\n');
    const config = parseProjectConfig(JSON.parse(readFileSync(join(dir, ".outside-in.json"), "utf8")));
    expect(loadableStepsProblems(dir, config)).toEqual([
      `${STEP_FILE}:1 imports "../../src/setup.js", which does not exist yet: import it dynamically inside the step`,
    ]);
  });
});
