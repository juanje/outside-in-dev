import { CYCLE_STEP } from "./progress.js";
import type { ProjectConfig } from "./project-config.js";

/** What a changed file is, for the rules of a step. */
export const FILE_KIND = { source: "source", unitTest: "unit test", step: "step", feature: "feature" } as const;
export type FileKind = (typeof FILE_KIND)[keyof typeof FILE_KIND];

/** A line a file gained since the last checkpoint. */
export interface AddedLine {
  line: number;
  text: string;
}

/** A file that changed since the last checkpoint, with the lines it gained. */
export interface ChangedFile {
  file: string;
  kind: FileKind | undefined;
  added: AddedLine[];
  /** Whether the file is a feature file whose feature is past `bdd_red`. */
  approvedFeature: boolean;
  /** The lines of its `readFileSync` calls that read a path under the source directories. */
  sourceReads: number[];
}

/** The substrings that added lines of source files and of test files must not contain. */
export interface ForbiddenPatterns {
  source: string[];
  tests: string[];
}

/** The pattern that stands for a test that reads source code: only a call that reads a path under the source directories counts. */
const READS_SOURCE_PATTERN = "readFileSync";

// The defaults are assembled from parts so that this file does not hold the very text it forbids in added lines.
const DEFAULT_FORBIDDEN_IN_SRC = [`@ts-${"ignore"}`, `@ts-${"expect-error"}`, `process.env.${"VITEST"}`, `import.meta.${"vitest"}`, `NODE_ENV === "te${"st"}"`];
const DEFAULT_FORBIDDEN_IN_TESTS = [`.${"only"}(`, `.${"skip"}(`, `.${"todo"}(`];

/** The lists of forbidden patterns of the project: the configured ones, and the defaults for each list it does not give. */
export function forbiddenPatterns({ integrity }: ProjectConfig): ForbiddenPatterns {
  return {
    source: integrity?.forbidden_in_src ?? DEFAULT_FORBIDDEN_IN_SRC,
    tests: integrity?.forbidden_in_tests ?? [...DEFAULT_FORBIDDEN_IN_TESTS, READS_SOURCE_PATTERN],
  };
}

/** A list of forbidden patterns, the kinds of file it applies to, and how a file of those kinds is named in a violation. */
interface PatternList {
  of: (patterns: ForbiddenPatterns) => string[];
  kinds: FileKind[];
  place: string;
}

const SOURCE_PATTERNS: PatternList = { of: (patterns) => patterns.source, kinds: [FILE_KIND.source], place: FILE_KIND.source };
const TEST_PATTERNS: PatternList = { of: (patterns) => patterns.tests, kinds: [FILE_KIND.unitTest, FILE_KIND.step], place: "a test" };

/** The kinds of file a step forbids changing, what the change is called, and the lists of patterns the step applies. */
interface StepRules {
  kinds: FileKind[];
  rule: string;
  lists: PatternList[];
}

const CODE_STEP: StepRules = { kinds: [FILE_KIND.unitTest, FILE_KIND.step, FILE_KIND.feature], rule: "changed a test while writing code", lists: [SOURCE_PATTERNS] };
const TEST_STEP: StepRules = { kinds: [FILE_KIND.source], rule: "changed source code while writing tests", lists: [TEST_PATTERNS] };
const NO_CHANGE_STEP: StepRules = { kinds: [], rule: "", lists: [SOURCE_PATTERNS, TEST_PATTERNS] };

const STEP_RULES: Record<string, StepRules> = {
  [CYCLE_STEP.select]: NO_CHANGE_STEP,
  [CYCLE_STEP.bddRed]: TEST_STEP,
  [CYCLE_STEP.tddRed]: TEST_STEP,
  [CYCLE_STEP.tddGreen]: CODE_STEP,
  [CYCLE_STEP.refactor]: CODE_STEP,
  [CYCLE_STEP.qualityGate]: NO_CHANGE_STEP,
};

/** What an added line breaks by holding `pattern`, when it does: the text of the pattern, or for `readFileSync` the call that reads source code. */
function breakage({ line, text }: AddedLine, pattern: string, { sourceReads }: ChangedFile, place: string): string | undefined {
  if (!text.includes(pattern)) return undefined;
  if (pattern !== READS_SOURCE_PATTERN) return `:${line} forbidden pattern "${pattern}" in ${place}`;
  return sourceReads.includes(line) ? `:${line} reads source code as text` : undefined;
}

/** One line, `<file>:<line> <rule>`, for each added line of a file that holds one of the patterns of `lists`. */
function patternViolations(files: ChangedFile[], patterns: ForbiddenPatterns, lists: PatternList[]): string[] {
  return lists.flatMap(({ of, kinds, place }) =>
    files
      .filter(({ kind }) => kind !== undefined && kinds.includes(kind))
      .flatMap((file) =>
        file.added.flatMap((added) => of(patterns).map((pattern) => breakage(added, pattern, file, place)).flatMap((found) => (found === undefined ? [] : [`${file.file}${found}`]))),
      ),
  );
}

/** One line for each approved feature file that changed, unless the step already names it. */
function approvedViolations(files: ChangedFile[], named: Set<string>): string[] {
  return files.filter(({ file, approvedFeature }) => approvedFeature && !named.has(file)).map(({ file }) => `${file} changed an approved feature file`);
}

/** One line, `<file>[:<line>] <rule>`, for each rule that the changes of `step` break. */
export function integrityViolations(step: string, files: ChangedFile[], patterns: ForbiddenPatterns): string[] {
  const rules = STEP_RULES[step];
  if (rules === undefined) return [];
  const changed = files.filter(({ kind }) => kind !== undefined && rules.kinds.includes(kind));
  const approved = approvedViolations(files, new Set(changed.map(({ file }) => file)));
  return [...changed.map(({ file }) => `${file} ${rules.rule}`), ...approved, ...patternViolations(files, patterns, rules.lists)];
}
