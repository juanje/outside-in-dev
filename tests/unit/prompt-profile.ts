import { type CycleState, type Profile, profileFor } from "../../src/agents/profiles.js";
import { parseProjectConfig } from "../../src/artifacts/project-config.js";

/** The conventions file of the project the prompt tests use. */
export const CONVENTIONS_FILE = "docs/RULES.md";

const config = parseProjectConfig({
  version: 1,
  stack: "typescript",
  paths: {
    source: ["lib/**/*.ts"],
    shared: [],
    unit_tests: ["spec/**/*.spec.ts"],
    bdd_features: ["bdd/**/*.feature"],
    bdd_steps: ["bdd/steps/**/*.ts"],
    docs: ["README.md"],
    spec: "REQS.md",
    design: ["docs/design.md"],
    progress: "progress.json",
    conventions: [CONVENTIONS_FILE],
  },
  commands: { bdd: "run-bdd", unit: "run-unit", typecheck: "run-types", format: null, lint: null, coverage: null, extra_checks: [] },
});

/** The real profile of a step in a project that lists a conventions file, which the prompt of the step is built from. */
export function profileOf(state: CycleState): Profile {
  return profileFor(state, config);
}
