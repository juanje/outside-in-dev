import { CATEGORY, type FindingDraft } from "./findings.js";
import type { ProjectPaths } from "./project-paths.js";

interface Named {
  name: string;
}

interface Located extends Named {
  line: number;
}

interface KnipIssue {
  file: string;
  exports: Located[];
  types: Located[];
  files: Named[];
  dependencies: Named[];
  devDependencies: Named[];
}

/** The 1-based line of package.json that declares the dependency. */
function declarationLine(packageJson: string, name: string): number {
  return packageJson.split("\n").findIndex((line) => line.includes(`"${name}":`)) + 1;
}

/** The findings in the JSON report of knip; `packageJson` is the text of the project's package.json, to place the dependencies. */
export function knipFindings(report: unknown, packageJson = ""): FindingDraft[] {
  const { issues } = report as { issues: KnipIssue[] };
  const dependency = (file: string, kind: string, { name }: Named): FindingDraft => {
    const line = declarationLine(packageJson, name);
    return { category: CATEGORY.deadCode, file, range: { start: line, end: line }, detail: `unused ${kind} ${name}` };
  };
  return issues.flatMap(({ file, exports, types, files, dependencies, devDependencies }) => [
    ...[...exports, ...types].map(({ name, line }): FindingDraft => ({
      category: CATEGORY.deadCode,
      file,
      range: { start: line, end: line },
      symbol: name,
      detail: "unused export",
    })),
    ...files.map(({ name }): FindingDraft => ({ category: CATEGORY.deadCode, file: name, range: { start: 1, end: 1 }, detail: "unused file" })),
    ...dependencies.map((entry) => dependency(file, "dependency", entry)),
    ...devDependencies.map((entry) => dependency(file, "devDependency", entry)),
  ]);
}

/** The configuration of knip: the test files and `entry` are the entry points (knip adds those of package.json), generated files are ignored. */
export function knipConfig({ source, tests }: Pick<ProjectPaths, "source" | "tests">, entry: string[]) {
  return { entry: [...tests, ...entry], project: [...source, ...tests], ignore: ["**/*.generated.*"] };
}
