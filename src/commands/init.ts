import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { ProgressError, PROGRESS_FILE, requireValid, saveProgress, validateProgress } from "../artifacts/progress.js";
import { convertProgress, type Conversion } from "../artifacts/progress-import.js";
import { CONFIG_FILE, parseProjectConfig, type ProjectConfig } from "../artifacts/project-config.js";
import { detectCommands, isOutsideInIgnored, withOutsideInIgnored } from "../artifacts/project-setup.js";
import { parseRequirements, SPEC_FILE, validateSpec } from "../artifacts/spec.js";
import type { CliIo } from "../cli-io.js";

const TSCONFIG_FILE = "tsconfig.json";
const PACKAGE_FILE = "package.json";
const GITIGNORE_FILE = ".gitignore";
const VITEST_CONFIGS = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"];
const CUCUMBER_CONFIGS = ["cucumber.mjs", "cucumber.js", "cucumber.cjs", "cucumber.json"];

const DEFAULT_SOURCE = ["src/**"];
const DEFAULT_UNIT_TESTS = ["tests/unit/**"];
const DEFAULT_BDD_FEATURES = ["features/**/*.feature"];
const DEFAULT_BDD_STEPS = ["features/steps/**", "features/support/**"];

/** The SPEC.md problems that make a valid progress file impossible. */
const BLOCKING_SPEC_PROBLEMS = ["duplicate ID", "empty title"];

const STRING_LITERAL = /"([^"]*)"|'([^']*)'/g;

type JsonObject = Record<string, any>;

/** Reads a JSON file of the project; undefined when it does not exist. */
function readJson(cwd: string, name: string): JsonObject | undefined {
  const text = readText(cwd, name);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new ProgressError(`${name} is not valid JSON: ${error.message}`);
  }
}

function readText(cwd: string, name: string): string | undefined {
  const path = join(cwd, name);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/** The text of the first of `names` that exists in the project; empty when none does. */
function readFirstExisting(cwd: string, names: string[]): string {
  const name = names.find((candidate) => existsSync(join(cwd, candidate)));
  return name === undefined ? "" : readText(cwd, name)!;
}

/** The string literals of the first `key: [ ... ]` array in a configuration source; undefined when there is none. */
function extractStringArray(source: string, key: string): string[] | undefined {
  const array = new RegExp(`\\b${key}["']?\\s*:\\s*\\[([^\\]]*)\\]`).exec(source);
  if (!array) return undefined;
  return [...array[1]!.matchAll(STRING_LITERAL)].map((literal) => literal[1] ?? literal[2]!);
}

function isTypeScriptProject(cwd: string, manifest: JsonObject | undefined): boolean {
  const dependencies = { ...manifest?.dependencies, ...manifest?.devDependencies };
  return existsSync(join(cwd, TSCONFIG_FILE)) || "typescript" in dependencies;
}

function detectConfig(cwd: string, manifest: JsonObject | undefined): ProjectConfig {
  const vitestConfig = readFirstExisting(cwd, VITEST_CONFIGS);
  const cucumberConfig = readFirstExisting(cwd, CUCUMBER_CONFIGS);
  return {
    version: 1,
    stack: "typescript",
    paths: {
      source: readJson(cwd, TSCONFIG_FILE)?.include ?? DEFAULT_SOURCE,
      shared: [],
      unit_tests: extractStringArray(vitestConfig, "include") ?? DEFAULT_UNIT_TESTS,
      bdd_features: extractStringArray(cucumberConfig, "paths") ?? DEFAULT_BDD_FEATURES,
      bdd_steps:
        extractStringArray(cucumberConfig, "import") ?? extractStringArray(cucumberConfig, "require") ?? DEFAULT_BDD_STEPS,
      docs: ["README.md", "docs/**"],
      spec: "SPEC.md",
      design: ["SPEC.md", "DOMAIN.md", "DECISIONS.md"],
      progress: "progress.json",
    },
    commands: {
      ...detectCommands(manifest?.scripts ?? {}),
      coverage: null,
      extra_checks: [],
    },
  };
}

/** Creates progress.json from the requirements of SPEC.md unless it already exists. */
function initialiseProgress(io: CliIo): void {
  const spec = readText(io.cwd, SPEC_FILE);
  if (existsSync(join(io.cwd, PROGRESS_FILE))) {
    io.stdout(`${PROGRESS_FILE} already exists and was left untouched.\n`);
  } else if (spec !== undefined) {
    const problems = validateSpec(spec).filter((violation) => BLOCKING_SPEC_PROBLEMS.includes(violation.kind));
    if (problems.length > 0) {
      const lines = problems.map((problem) => `  ${problem.id}: ${problem.kind}`).join("\n");
      throw new ProgressError(
        `${SPEC_FILE} cannot be turned into ${PROGRESS_FILE}:\n${lines}\n${CONFIG_FILE} was written; no ${PROGRESS_FILE} was created`,
      );
    }
    const features = parseRequirements(spec)
      .filter((requirement) => requirement.id.startsWith("FR-"))
      .map(({ id, title }) => ({ id, title, status: "pending" }));
    saveProgress(io.cwd, { current_focus: null, features });
  } else {
    io.stdout(`${SPEC_FILE} not found: no ${PROGRESS_FILE} was created.\n`);
  }
}

const ALREADY_CURRENT = "current";

/** Converts the progress.json of the project to the current schema without writing it. */
function convertExistingProgress(io: CliIo): Conversion | typeof ALREADY_CURRENT {
  const document = readJson(io.cwd, PROGRESS_FILE);
  if (document === undefined) throw new ProgressError(`${PROGRESS_FILE} not found in ${io.cwd}`);
  if (validateProgress(document).length === 0) return ALREADY_CURRENT;
  const conversion = convertProgress(document);
  requireValid(conversion.progress);
  return conversion;
}

export function runInit(io: CliIo, importProgress: boolean): number {
  if (existsSync(join(io.cwd, CONFIG_FILE))) {
    throw new ProgressError(`${CONFIG_FILE} already exists; remove it to run oid init again`);
  }
  const manifest = readJson(io.cwd, PACKAGE_FILE);
  if (!isTypeScriptProject(io.cwd, manifest)) {
    throw new ProgressError("only TypeScript projects are supported");
  }
  const imported = importProgress ? convertExistingProgress(io) : undefined;
  const config = parseProjectConfig(detectConfig(io.cwd, manifest));
  writeFileAtomic(join(io.cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
  const gitignore = readText(io.cwd, GITIGNORE_FILE);
  const alreadyIgnored = isOutsideInIgnored(gitignore);
  if (!alreadyIgnored) writeFileAtomic(join(io.cwd, GITIGNORE_FILE), withOutsideInIgnored(gitignore));
  if (imported === ALREADY_CURRENT) {
    io.stdout(`${PROGRESS_FILE} is already in the current schema.\n`);
  } else if (imported) {
    saveProgress(io.cwd, imported.progress);
    imported.notes.forEach((note) => io.stdout(`${note}\n`));
  } else {
    initialiseProgress(io);
  }
  io.stdout(`Detected a ${config.stack} project (source: ${config.paths.source.join(", ")}).\n`);
  io.stdout(
    alreadyIgnored
      ? `Wrote ${CONFIG_FILE}; ${GITIGNORE_FILE} already ignores .outside-in/.\n`
      : `Wrote ${CONFIG_FILE} and added .outside-in/ to ${GITIGNORE_FILE}.\n`,
  );
  return 0;
}
