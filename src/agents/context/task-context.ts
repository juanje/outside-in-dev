import { NEWLINE } from "../../artifacts/lines.js";
import { loadProjectConfig } from "../../artifacts/project-config.js";
import { readText } from "../../artifacts/project-json.js";
import { listLocatedScenarios } from "../../artifacts/traceability.js";
import { importClosure } from "./import-closure.js";
import { reuseCatalogue } from "./reuse-catalogue.js";

/** The scenario a test task is about: its feature file, relative to the project, and the line where it starts. */
export type ScenarioLocation = { file: string; line: number };

/** The text of the scenario at `location`, from its line to the line before the next scenario. */
function scenarioText(cwd: string, { file, line }: ScenarioLocation): string {
  const text = readText(cwd, file) ?? "";
  const next = listLocatedScenarios([{ path: file, text }]).find((scenario) => scenario.line > line);
  return text
    .split(NEWLINE)
    .slice(line - 1, next === undefined ? undefined : next.line - 1)
    .join(NEWLINE)
    .trimEnd();
}

/** The reuse catalogue as a section of a prompt: the public signatures of the project's exported symbols, without bodies. */
const CATALOGUE_HEADING = "Reuse catalogue (exported symbols of the project, without bodies):";

/** The prompt of a test task (BDD_RED or TDD_RED): the scenario with its location and the normalised failure, and the public signatures of the project; no body of the source and no other scenario. */
export function testTaskContext(cwd: string, task: { scenario: ScenarioLocation; failure: string }): string {
  const { file, line } = task.scenario;
  return [`Scenario (${file}:${line}):`, scenarioText(cwd, task.scenario), "Failure:", task.failure, CATALOGUE_HEADING, reuseCatalogue(cwd)].join(NEWLINE + NEWLINE);
}

/** A file of the project as a section of a prompt: its path and its whole text. */
function fileSection(cwd: string, file: string): string {
  return [`### ${file}`, readText(cwd, file) ?? ""].join(NEWLINE);
}

/** The prompt of an implementation task (CODE_GREEN): the failing tests in full, the normalised failure, the source files the tests import and the reuse catalogue; no other scenario and no earlier attempt. */
export function implementationContext(cwd: string, task: { tests: string[]; failure: string }): string {
  const imported = importClosure(cwd, task.tests, loadProjectConfig(cwd).paths.source);
  const sections = [
    ["Failing tests:", ...task.tests.map((test) => fileSection(cwd, test))],
    ["Failure:", task.failure],
    ["Source the tests import:", ...imported.map((file) => fileSection(cwd, file))],
    [CATALOGUE_HEADING, reuseCatalogue(cwd)],
  ];
  return sections.map((section) => section.join(NEWLINE + NEWLINE)).join(NEWLINE + NEWLINE);
}
