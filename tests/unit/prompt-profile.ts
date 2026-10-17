import { expect } from "vitest";
import { type CycleState, type Profile, profileFor } from "../../src/agents/profiles.js";
import { accessStatement } from "../../src/agents/prompts/shared.js";
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

/** Asserts that the access text of a prompt is generated from the profile it is built with: it holds the text `accessStatement` makes from the real profile of the step once, every glob the profile grants (the conventions file among the readable ones), and a profile with other globs gives a prompt with the text of that profile instead. */
export function expectAccess(state: CycleState, promptOf: (profile: Profile) => string): void {
  const profile = profileOf(state);
  const prompt = promptOf(profile);
  expect(prompt.split(accessStatement(profile))).toHaveLength(2);
  expect(profile.read).toContain(CONVENTIONS_FILE);
  for (const glob of [...profile.write, ...profile.read]) expect(prompt).toContain(glob);
  const other = { ...profile, write: ["other/write/**"], read: ["other/read/**", CONVENTIONS_FILE] };
  const changed = promptOf(other);
  expect(changed).toContain("other/write/**");
  expect(changed).toContain("other/read/**");
  expect(changed).not.toContain(accessStatement(profile));
  expect(changed.split(accessStatement(other))).toHaveLength(2);
}

/** The real profile of a step in a project that lists a conventions file, which the prompt of the step is built from. */
export function profileOf(state: CycleState): Profile {
  return profileFor(state, config);
}
