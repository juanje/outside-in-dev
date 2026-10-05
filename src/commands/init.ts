import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
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

/** Parses the text of a project file: tsconfig.json as JSON with comments and trailing commas, the rest as strict JSON. */
function parseProjectJson(name: string, text: string): unknown {
  if (name !== TSCONFIG_FILE) {
    try {
      return JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new ProgressError(`${name} is not valid JSON: ${error.message}`);
    }
  }
  const errors: ParseError[] = [];
  const document: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const { error, offset } = errors[0]!;
    throw new ProgressError(`${name} is not valid JSON: ${printParseErrorCode(error)} at offset ${offset}`);
  }
  return document;
}

/** Reads a JSON file of the project; undefined when it does not exist. The content is not trusted. */
function readJson(cwd: string, name: string): unknown {
  const text = readText(cwd, name);
  return text === undefined ? undefined : parseProjectJson(name, text);
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
  const manifest = asObject(readJson(io.cwd, PACKAGE_FILE));
  if (!isTypeScriptProject(io.cwd, manifest)) {
    throw new ProgressError("only TypeScript projects are supported");
  }
  const imported = importProgress ? convertExistingProgress(io) : undefined;
  const detected = detectConfig(io.cwd, manifest);
  const config = parseProjectConfig(detected.config);
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
