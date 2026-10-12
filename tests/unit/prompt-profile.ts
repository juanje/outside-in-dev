import { expect } from "vitest";
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

/** Asserts that a rule of the prompt a step builds from its real profile (rule 4 unless given) says what the profile grants (the globs it may write and read, the conventions file among them, and that a refused path is refused at once) and also the given sentences, which are the reason for the limit. */
export function expectAccessRule(state: CycleState, promptOf: (profile: Profile) => string, reason: string[], number = 4): void {
  const profile = profileOf(state);
  const rule = promptOf(profile)
    .split("\n")
    .find((line) => line.startsWith(`${number}. `));
  const grant = [`You may write: ${profile.write.join(", ")}.`, `You may read: ${profile.read.join(", ")}.`, CONVENTIONS_FILE, "A path you may not read is refused at once; do not search for it."];
  for (const sentence of [...reason, ...grant]) expect(rule).toContain(sentence);
}

/** The real profile of a step in a project that lists a conventions file, which the prompt of the step is built from. */
export function profileOf(state: CycleState): Profile {
  return profileFor(state, config);
}
