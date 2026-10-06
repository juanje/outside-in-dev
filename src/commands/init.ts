import { existsSync, rmSync } from "node:fs";
import { join, posix } from "node:path";
import { writeFileAtomic } from "../artifacts/atomic-write.js";
import { ProgressError, PROGRESS_FILE, requireValid, saveProgress, validateProgress } from "../artifacts/progress.js";
import { readJson, readText, TSCONFIG_FILE } from "../artifacts/project-json.js";
import { convertProgress, type Conversion } from "../artifacts/progress-import.js";
import { CONFIG_FILE, parseProjectConfig, type ProjectConfig } from "../artifacts/project-config.js";
import { detectCommands, isOutsideInIgnored, withOutsideInIgnored } from "../artifacts/project-setup.js";
import { parseRequirements, SPEC_FILE, validateSpec } from "../artifacts/spec.js";
import type { CliIo } from "../cli-io.js";

const PACKAGE_FILE = "package.json";
const GITIGNORE_FILE = ".gitignore";
const VITEST_CONFIGS = ["vitest.config.ts", "vitest.config.mts", "vitest.config.js", "vitest.config.mjs"];
const CUCUMBER_CONFIGS = ["cucumber.mjs", "cucumber.js", "cucumber.cjs", "cucumber.json"];

const SPECS_DIR = "specs";
const SHARED_DIR = "shared";
const TEST_ROOTS = ["test", "tests", "__tests__", "spec", "specs", "features"];
const SOURCE_DIR = "src";
const TEST_FILE_PATTERN = /\.(test|spec)\./;
const DEFAULT_SOURCE = ["src/**"];
const DEFAULT_UNIT_TESTS = ["tests/unit/**"];
const DEFAULT_BDD_FEATURES = ["features/**/*.feature"];
const DEFAULT_BDD_STEPS = ["features/steps/**", "features/support/**"];

/** The SPEC.md problems that make a valid progress file impossible. */
const BLOCKING_SPEC_PROBLEMS = ["duplicate ID", "empty title"];

const STRING_LITERAL = /"([^"]*)"|'([^']*)'/g;

type JsonObject = Record<string, unknown>;

/** The value as a JSON object; undefined for anything else (arrays, strings, numbers, null). */
function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
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

/** The fields of an object-valued field of the manifest; none when it is missing or not an object. */
function manifestSection(manifest: JsonObject | undefined, key: string): JsonObject {
  return asObject(manifest?.[key]) ?? {};
}

function isTypeScriptProject(cwd: string, manifest: JsonObject | undefined): boolean {
  const dependencies = { ...manifestSection(manifest, "dependencies"), ...manifestSection(manifest, "devDependencies") };
  return existsSync(join(cwd, TSCONFIG_FILE)) || "typescript" in dependencies;
}

/** A configuration as detected, before it is validated: what the project's files hold is not trusted. */
type DetectedConfig = Omit<ProjectConfig, "paths"> & { paths: Omit<ProjectConfig["paths"], "source"> & { source: unknown } };

/** The scripts of the manifest that are commands. */
function manifestScripts(manifest: JsonObject | undefined): Record<string, string> {
  const scripts = manifestSection(manifest, "scripts");
  return Object.fromEntries(Object.entries(scripts).filter((script): script is [string, string] => typeof script[1] === "string"));
}

/** Where the specification lives: the root SPEC.md, else specs/SPEC.md, else the root default. */
function detectSpecPath(cwd: string): string {
  return !existsSync(join(cwd, SPEC_FILE)) && existsSync(join(cwd, SPECS_DIR, SPEC_FILE)) ? posix.join(SPECS_DIR, SPEC_FILE) : SPEC_FILE;
}

/** The first directory of a glob. */
function firstSegment(glob: string): string {
  return glob.split("/")[0]!;
}

/** Whether an include entry points at tests: a test directory or a test file pattern. */
function isTestEntry(entry: string, testRoots: string[]): boolean {
  return testRoots.includes(firstSegment(entry)) || TEST_FILE_PATTERN.test(entry);
}

/** The include entries of tsconfig.json without the ones that point at tests; anything that is not a list is passed on to validation. */
function sourceWithoutTests(include: unknown, testRoots: string[]): { source: unknown; leftOut: string[] } {
  if (!Array.isArray(include)) return { source: include ?? DEFAULT_SOURCE, leftOut: [] };
  const leftOut = include.map(String).filter((entry) => isTestEntry(entry, testRoots));
  const kept = include.filter((entry) => !leftOut.includes(String(entry)));
  return { source: kept.length > 0 ? kept : DEFAULT_SOURCE, leftOut };
}

function detectConfig(cwd: string, manifest: JsonObject | undefined): { config: DetectedConfig; leftOut: string[] } {
  const vitestConfig = readFirstExisting(cwd, VITEST_CONFIGS);
  const cucumberConfig = readFirstExisting(cwd, CUCUMBER_CONFIGS);
  const spec = detectSpecPath(cwd);
  const specDir = posix.dirname(spec);
  const besideSpec = (file: string): string => posix.join(specDir, file);
  const unitTests = extractStringArray(vitestConfig, "include") ?? DEFAULT_UNIT_TESTS;
  const bddFeatures = extractStringArray(cucumberConfig, "paths") ?? DEFAULT_BDD_FEATURES;
  const bddSteps =
    extractStringArray(cucumberConfig, "import") ?? extractStringArray(cucumberConfig, "require") ?? DEFAULT_BDD_STEPS;
  const testRoots = [...TEST_ROOTS, ...[...unitTests, ...bddFeatures, ...bddSteps].map(firstSegment)].filter(
    (root) => root !== SOURCE_DIR,
  );
  const { source, leftOut } = sourceWithoutTests(asObject(readJson(cwd, TSCONFIG_FILE))?.include, testRoots);
  const config: DetectedConfig = {
    version: 1,
    stack: "typescript",
    paths: {
      source,
      shared: existsSync(join(cwd, SHARED_DIR)) ? [`${SHARED_DIR}/**`] : [],
      unit_tests: unitTests,
      bdd_features: bddFeatures,
      bdd_steps: bddSteps,
      docs: ["README.md", "docs/**"],
      spec,
      design: [spec, besideSpec("DOMAIN.md"), besideSpec("DECISIONS.md")],
      progress: besideSpec(PROGRESS_FILE),
    },
    commands: {
      ...detectCommands(manifestScripts(manifest)),
      coverage: null,
      extra_checks: [],
    },
  };
  return { config, leftOut };
}

/** Creates the progress file from the requirements of the specification unless it already exists. */
function initialiseProgress(io: CliIo, { spec: specFile, progress: progressFile }: ProjectConfig["paths"]): void {
  const spec = readText(io.cwd, specFile);
  if (existsSync(join(io.cwd, progressFile))) {
    io.stdout(`${progressFile} already exists and was left untouched.\n`);
  } else if (spec !== undefined) {
    const problems = validateSpec(spec).filter((violation) => BLOCKING_SPEC_PROBLEMS.includes(violation.kind));
    if (problems.length > 0) {
      const lines = problems.map((problem) => `  ${problem.id}: ${problem.kind}`).join("\n");
      throw new ProgressError(
        `${specFile} cannot be turned into ${progressFile}:\n${lines}\n${CONFIG_FILE} was written; no ${progressFile} was created`,
      );
    }
    const features = parseRequirements(spec)
      .filter((requirement) => requirement.id.startsWith("FR-"))
      .map(({ id, title }) => ({ id, title, status: "pending" }));
    saveProgress(io.cwd, { current_focus: null, features }, progressFile);
  } else {
    io.stdout(`${specFile} not found: no ${progressFile} was created.\n`);
  }
}

const ALREADY_CURRENT = "current";

/** Where the existing progress file is looked for when no path is given, in order. */
const PROGRESS_CANDIDATES = [PROGRESS_FILE, posix.join(SPECS_DIR, PROGRESS_FILE)];

type ExistingProgress = { source: string; conversion: Conversion | typeof ALREADY_CURRENT };

/** The existing progress file to import: the given path, else the first candidate that exists; undefined when there is none. */
function findProgressSource(cwd: string, given: string | undefined): string | undefined {
  if (given !== undefined) return existsSync(join(cwd, given)) ? posix.normalize(given) : undefined;
  return PROGRESS_CANDIDATES.find((candidate) => existsSync(join(cwd, candidate)));
}

/** Converts the existing progress file of the project to the current schema without writing it. */
function convertExistingProgress(io: CliIo, given: string | undefined): ExistingProgress {
  const source = findProgressSource(io.cwd, given);
  if (source === undefined) {
    throw new ProgressError(
      given === undefined ? `${PROGRESS_FILE} not found (looked at: ${PROGRESS_CANDIDATES.join(", ")})` : `${given} not found`,
    );
  }
  const document = readJson(io.cwd, source);
  if (validateProgress(document).length === 0) return { source, conversion: ALREADY_CURRENT };
  const conversion = convertProgress(document);
  requireValid(conversion.progress);
  return { source, conversion };
}

export function runInit(io: CliIo, importProgress: boolean, progressPath?: string): number {
  if (existsSync(join(io.cwd, CONFIG_FILE))) {
    throw new ProgressError(`${CONFIG_FILE} already exists; remove it to run oid init again`);
  }
  const manifest = asObject(readJson(io.cwd, PACKAGE_FILE));
  if (!isTypeScriptProject(io.cwd, manifest)) {
    throw new ProgressError("only TypeScript projects are supported");
  }
  const imported = importProgress ? convertExistingProgress(io, progressPath) : undefined;
  const detected = detectConfig(io.cwd, manifest);
  const config = parseProjectConfig(detected.config);
  if (imported && imported.source !== config.paths.progress && existsSync(join(io.cwd, config.paths.progress))) {
    throw new ProgressError(
      `${config.paths.progress} already exists and is not ${imported.source}; nothing was written or removed`,
    );
  }
  writeFileAtomic(join(io.cwd, CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
  const gitignore = readText(io.cwd, GITIGNORE_FILE);
  const alreadyIgnored = isOutsideInIgnored(gitignore);
  if (!alreadyIgnored) writeFileAtomic(join(io.cwd, GITIGNORE_FILE), withOutsideInIgnored(gitignore));
  if (imported) {
    const destination = config.paths.progress;
    if (imported.conversion === ALREADY_CURRENT) {
      io.stdout(`${imported.source} is already in the current schema.\n`);
      if (imported.source !== destination) writeFileAtomic(join(io.cwd, destination), readText(io.cwd, imported.source)!);
    } else {
      saveProgress(io.cwd, imported.conversion.progress, destination);
      imported.conversion.notes.forEach((note) => io.stdout(`${note}\n`));
    }
    if (imported.source !== destination) {
      rmSync(join(io.cwd, imported.source));
      io.stdout(`progress read from ${imported.source} and written to ${destination}; ${imported.source} was removed\n`);
    }
  } else {
    initialiseProgress(io, config.paths);
  }
  io.stdout(`Detected a ${config.stack} project (source: ${config.paths.source.join(", ")}).\n`);
  if (detected.leftOut.length > 0) io.stdout(`Include entries left out of paths.source as tests: ${detected.leftOut.join(", ")}\n`);
  io.stdout(
    alreadyIgnored
      ? `Wrote ${CONFIG_FILE}; ${GITIGNORE_FILE} already ignores .outside-in/.\n`
      : `Wrote ${CONFIG_FILE} and added .outside-in/ to ${GITIGNORE_FILE}.\n`,
  );
  return 0;
}
