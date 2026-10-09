import { z } from "zod";
import { CATEGORY } from "./findings.js";
import { ProgressError } from "./progress.js";
import { readJson } from "./project-json.js";

export const CONFIG_FILE = ".outside-in.json";

const WORKTREE = "worktree";
const globs = z.array(z.string());
const command = z.string().nullable();

const projectConfigSchema = z.strictObject({
  version: z.literal(1),
  stack: z.literal("typescript"),
  paths: z.strictObject({
    source: globs,
    shared: globs,
    unit_tests: globs,
    bdd_features: globs,
    bdd_steps: globs,
    docs: globs,
    spec: z.string(),
    design: globs,
    progress: z.string(),
  }),
  commands: z.strictObject({
    bdd: z.string(),
    unit: z.string(),
    typecheck: z.string(),
    format: command,
    lint: command,
    coverage: command,
    extra_checks: z.array(z.string()),
  }),
  refactor: z
    .strictObject({
      detectors: z
        .strictObject({
          complexity: z.strictObject({ max_cyclomatic: z.number().optional(), max_depth: z.number().optional() }).optional(),
          duplication: z.strictObject({ min_lines: z.number().optional(), min_tokens: z.number().optional() }).optional(),
          magic_value: z.strictObject({ ignore: z.array(z.number()).optional(), min_string_repeats: z.number().optional() }).optional(),
        })
        .optional(),
      entry: globs.optional(),
    })
    .optional(),
  limits: z.strictObject({ max_inner_iterations: z.number().int().positive().optional(), command_timeout_s: z.number().int().positive().optional() }).optional(),
  integrity: z.strictObject({ forbidden_in_src: z.array(z.string()).optional(), forbidden_in_tests: z.array(z.string()).optional() }).optional(),
  settings: z
    .strictObject({
      isolation: z.enum([WORKTREE, "in_place"]).optional(),
      worktree_dir: z.string().optional(),
      branch_prefix: z.string().optional(),
      commit_template: z.string().optional(),
    })
    .optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/** Returns the document as a project configuration, or throws naming every invalid field. */
export function parseProjectConfig(document: unknown): ProjectConfig {
  const result = projectConfigSchema.safeParse(document);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  throw new ProgressError(`${CONFIG_FILE} is invalid:\n${problems.join("\n")}`);
}

type Detectors = NonNullable<NonNullable<ProjectConfig["refactor"]>["detectors"]>;

/** The limits of one detector: the configured ones, the defaults for the rest and without a configuration file. */
function loadLimits<K extends keyof Detectors, L extends Required<NonNullable<Detectors[K]>>>(cwd: string, detector: K, defaults: L): L {
  const document = readJson(cwd, CONFIG_FILE);
  if (document === undefined) return defaults;
  return { ...defaults, ...parseProjectConfig(document).refactor?.detectors?.[detector] };
}

export type DuplicationLimits = { min_lines: number; min_tokens: number };

const DEFAULT_COMPLEXITY = { max_cyclomatic: 10, max_depth: 4 };
const DEFAULT_DUPLICATION = { min_lines: 6, min_tokens: 50 };

/** The complexity limits of the project: the configured ones, the defaults for the rest and without a configuration file. */
export function loadComplexityLimits(cwd: string): { max_cyclomatic: number; max_depth: number } {
  return loadLimits(cwd, CATEGORY.complexity, DEFAULT_COMPLEXITY);
}

/** The duplication limits of the project: the configured ones, the defaults for the rest and without a configuration file. */
export function loadDuplicationLimits(cwd: string): DuplicationLimits {
  return loadLimits(cwd, CATEGORY.duplication, DEFAULT_DUPLICATION);
}

export type MagicValueLimits = { ignore: number[]; min_string_repeats: number };

const DEFAULT_MAGIC_VALUE = { ignore: [0, 1, -1], min_string_repeats: 3 };

/** The magic value limits of the project: the configured ones, the defaults for the rest and without a configuration file. */
export function loadMagicValueLimits(cwd: string): MagicValueLimits {
  return loadLimits(cwd, CATEGORY.magicValue, DEFAULT_MAGIC_VALUE);
}

/** The extra entry points of the project for the dead-code detector: `refactor.entry` of the configuration file. */
export function loadRefactorEntry(cwd: string): string[] {
  const document = readJson(cwd, CONFIG_FILE);
  return document === undefined ? [] : (parseProjectConfig(document).refactor?.entry ?? []);
}

const DEFAULT_INNER_ITERATIONS = 8;

/** How many times the inner loop may go through TDD Red, Code Green and the BDD check for one scenario: `limits.max_inner_iterations`, 8 by default and without a configuration file. */
export function loadInnerIterationLimit(cwd: string): number {
  const document = readJson(cwd, CONFIG_FILE);
  return document === undefined ? DEFAULT_INNER_ITERATIONS : (parseProjectConfig(document).limits?.max_inner_iterations ?? DEFAULT_INNER_ITERATIONS);
}

const DEFAULT_COMMAND_TIMEOUT_S = 600;

/** How long a command oid runs from the configuration may take before it is stopped: `limits.command_timeout_s`, 600 seconds by default and without a configuration file. */
export function loadCommandTimeoutS(cwd: string): number {
  const document = readJson(cwd, CONFIG_FILE);
  return document === undefined ? DEFAULT_COMMAND_TIMEOUT_S : (parseProjectConfig(document).limits?.command_timeout_s ?? DEFAULT_COMMAND_TIMEOUT_S);
}

export type GitSettings = { isolation: "worktree" | "in_place"; worktree_dir: string; branch_prefix: string; commit_template: string };

const DEFAULT_GIT_SETTINGS: GitSettings = {
  isolation: WORKTREE,
  worktree_dir: "../.oid-worktrees",
  branch_prefix: "oid/",
  commit_template: "{type}({scope}): {id} {title}",
};

/** How a run uses git: the configured `settings`, the defaults for the rest and without a configuration file. */
export function loadGitSettings(cwd: string): GitSettings {
  const document = readJson(cwd, CONFIG_FILE);
  if (document === undefined) return DEFAULT_GIT_SETTINGS;
  return { ...DEFAULT_GIT_SETTINGS, ...parseProjectConfig(document).settings };
}

/** The project's configuration; throws when the file is missing or invalid. */
export function loadProjectConfig(cwd: string): ProjectConfig {
  const document = readJson(cwd, CONFIG_FILE);
  if (document === undefined) throw new ProgressError(`${CONFIG_FILE} is missing in ${cwd}`);
  return parseProjectConfig(document);
}
