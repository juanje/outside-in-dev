/** The commands of a project whose three runners are scripts in it (unit-runner.mjs, bdd-runner.mjs, tsc-runner.mjs). */
export const RUNNER_COMMANDS = { bdd: "node bdd-runner.mjs", unit: "node unit-runner.mjs", typecheck: "node tsc-runner.mjs", format: null, lint: null, coverage: null, extra_checks: [] };
/** The paths of such a project: source in src/, features and steps under features/. */
export const RUNNER_PATHS = { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
