import { relative } from "node:path";
import { z } from "zod";
import { firstLine } from "./lines.js";
import { ProgressError } from "./progress.js";

const testSchema = z.object({
  fullName: z.string(),
  title: z.string(),
  status: z.string(),
  failureMessages: z.array(z.string()),
});

const reportSchema = z.object({
  testResults: z.array(z.object({ name: z.string(), message: z.string(), assertionResults: z.array(testSchema) })),
});

type UnitTestResult = z.infer<typeof testSchema>;

export interface UnitFileResult {
  file: string;
  /** The message of a file that failed to load (a missing module, a syntax error); empty when the file ran. */
  message: string;
  tests: UnitTestResult[];
}

/** The files of a vitest JSON report, each with its load message and its tests. */
export function normalizeVitestReport(report: unknown): UnitFileResult[] {
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success) throw new ProgressError("the unit runner wrote a report that is not a vitest JSON report");
  return parsed.data.testResults.map(({ name, message, assertionResults }) => ({ file: name, message, tests: assertionResults }));
}

export type TestSelection = { kind: "found"; test: UnitTestResult } | { kind: "several"; fullNames: string[] } | { kind: "none" };

/** The test of the report that `name` designates: the one whose full name is `name`, else the one whose title is. */
export function selectTest(files: UnitFileResult[], name: string): TestSelection {
  const tests = files.flatMap((file) => file.tests);
  const byFullName = tests.filter((candidate) => candidate.fullName === name);
  const candidates = byFullName.length > 0 ? byFullName : tests.filter((candidate) => candidate.title === name);
  if (candidates.length === 0) return { kind: "none" };
  if (candidates.length > 1) return { kind: "several", fullNames: candidates.map((candidate) => candidate.fullName) };
  return { kind: "found", test: candidates[0]! };
}

/** One line for each test of the report that failed and each file that did not load: the file relative to the project, the full name of the test and the first line of the failure. */
export function unitProblems(files: UnitFileResult[], cwd: string): string[] {
  return files.flatMap(({ file, message, tests }) => {
    const path = relative(cwd, file);
    if (message !== "") return [`unit ${path}: ${firstLine(message)}`];
    return tests.filter((test) => test.status === "failed").map((test) => `unit ${path} > ${test.fullName}: ${firstLine(test.failureMessages[0] ?? "")}`);
  });
}
