import { PROGRESS_FILE } from "./progress.js";
import { readJson } from "./project-json.js";
import { CONFIG_FILE, parseProjectConfig } from "./project-config.js";
import { SPEC_FILE } from "./spec.js";

export interface ProjectPaths {
  spec: string;
  progress: string;
  features: string[];
  source: string[];
  /** Globs of the BDD step definitions and their support files. */
  steps: string[];
  /** Globs of the test files: unit tests, BDD steps and feature files. */
  tests: string[];
  /** Globs of the documentation files; only the Markdown ones are checked. */
  docs: string[];
}

const DEFAULT_FEATURES = ["features/**/*.feature"];
const DEFAULT_SOURCE = ["src/**"];
const DEFAULT_DOCS = ["README.md", "docs/**"];
const DEFAULT_STEPS = ["features/steps/**", "features/support/**"];
const DEFAULT_TESTS = ["tests/unit/**", ...DEFAULT_STEPS, ...DEFAULT_FEATURES];

/** The spec, progress file, feature, source, test and documentation globs the commands work with, relative to `cwd`. */
export function loadProjectPaths(cwd: string): ProjectPaths {
  const document = readJson(cwd, CONFIG_FILE);
  if (document === undefined) {
    return { spec: SPEC_FILE, progress: PROGRESS_FILE, features: DEFAULT_FEATURES, source: DEFAULT_SOURCE, steps: DEFAULT_STEPS, tests: DEFAULT_TESTS, docs: DEFAULT_DOCS };
  }
  const { paths } = parseProjectConfig(document);
  return {
    spec: paths.spec,
    progress: paths.progress,
    features: paths.bdd_features,
    source: paths.source,
    steps: paths.bdd_steps,
    tests: [...paths.unit_tests, ...paths.bdd_steps, ...paths.bdd_features],
    docs: paths.docs,
  };
}
