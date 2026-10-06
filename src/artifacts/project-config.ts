import { z } from "zod";
import { ProgressError } from "./progress.js";
import { readJson } from "./project-json.js";

export const CONFIG_FILE = ".outside-in.json";

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
  return loadLimits(cwd, "complexity", DEFAULT_COMPLEXITY);
}

/** The duplication limits of the project: the configured ones, the defaults for the rest and without a configuration file. */
export function loadDuplicationLimits(cwd: string): DuplicationLimits {
  return loadLimits(cwd, "duplication", DEFAULT_DUPLICATION);
}

export type MagicValueLimits = { ignore: number[]; min_string_repeats: number };

const DEFAULT_MAGIC_VALUE = { ignore: [0, 1, -1], min_string_repeats: 3 };

/** The magic value limits of the project: the configured ones, the defaults for the rest and without a configuration file. */
export function loadMagicValueLimits(cwd: string): MagicValueLimits {
  return loadLimits(cwd, "magic_value", DEFAULT_MAGIC_VALUE);
}

/** The extra entry points of the project for the dead-code detector: `refactor.entry` of the configuration file. */
export function loadRefactorEntry(cwd: string): string[] {
  const document = readJson(cwd, CONFIG_FILE);
  return document === undefined ? [] : (parseProjectConfig(document).refactor?.entry ?? []);
}
