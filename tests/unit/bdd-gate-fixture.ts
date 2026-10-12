/** The paths and commands of the small projects the gates of BDD Red are tried on. */
export const PATHS = { source: ["src/**"], shared: [], unit_tests: ["tests/unit/**"], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
export const COMMANDS = { bdd: "node bdd.cjs", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };
