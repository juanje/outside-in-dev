import { z } from "zod";
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
