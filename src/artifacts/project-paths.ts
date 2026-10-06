import { PROGRESS_FILE } from "./progress.js";
import { readJson } from "./project-json.js";
import { CONFIG_FILE, parseProjectConfig } from "./project-config.js";
import { SPEC_FILE } from "./spec.js";

export interface ProjectPaths {
  spec: string;
  progress: string;
  features: string[];
}

const DEFAULT_FEATURES = ["features/**/*.feature"];

/** The spec, progress file and feature globs the commands work with, relative to `cwd`. */
export function loadProjectPaths(cwd: string): ProjectPaths {
  const document = readJson(cwd, CONFIG_FILE);
  if (document === undefined) return { spec: SPEC_FILE, progress: PROGRESS_FILE, features: DEFAULT_FEATURES };
  const { paths } = parseProjectConfig(document);
  return { spec: paths.spec, progress: paths.progress, features: paths.bdd_features };
}
