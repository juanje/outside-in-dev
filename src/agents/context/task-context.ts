import { globSync } from "tinyglobby";
import { NEWLINE } from "../../artifacts/lines.js";
import { loadProjectConfig } from "../../artifacts/project-config.js";
import { readText } from "../../artifacts/project-json.js";
import { listLocatedScenarios, readFeatureSources } from "../../artifacts/traceability.js";
import { parseRequirements } from "../../artifacts/spec.js";
import { importClosure } from "./import-closure.js";
import { reuseCatalogue } from "./reuse-catalogue.js";

const DOMAIN_FILE = "DOMAIN.md";

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
export const CATALOGUE_HEADING = "Reuse catalogue (exported symbols of the project, without bodies):";

/** The prompt of a test task (BDD_RED or TDD_RED): the scenario with its location and the normalised failure, and the public signatures of the project; no body of the source and no other scenario. */
export function testTaskContext(cwd: string, task: { scenario: ScenarioLocation; failure: string }): string {
  const { file, line } = task.scenario;
  return [`Scenario (${file}:${line}):`, scenarioText(cwd, task.scenario), "Failure:", task.failure, CATALOGUE_HEADING, reuseCatalogue(cwd)].join(NEWLINE + NEWLINE);
}

/** A file of the project as a section of a prompt: its path and its whole text. */
export function fileSection(cwd: string, file: string): string {
  return [`### ${file}`, readText(cwd, file) ?? ""].join(NEWLINE);
}

/** The heading of the section that holds the step definitions of the project in full, so that a new step reuses an existing one. */
const STEPS_HEADING = "Step definitions that exist:";

/** The prompt of a BDD Red task: the scenario with its location, the step definitions that exist and the public signatures of the project; no unit test, no body of the source and no other scenario. */
export function bddRedContext(cwd: string, scenario: ScenarioLocation): string {
  const steps = globSync(loadProjectConfig(cwd).paths.bdd_steps, { cwd }).sort();
  const failure = "The scenario has no step definitions yet.";
  return [testTaskContext(cwd, { scenario, failure }), [STEPS_HEADING, ...steps.map((file) => fileSection(cwd, file))].join(NEWLINE + NEWLINE)].join(NEWLINE + NEWLINE);
}

/** The sections of a prompt as text, each one's lines and the sections themselves apart by a blank line. */
export function joinSections(sections: string[][]): string {
  return sections.map((section) => section.join(NEWLINE + NEWLINE)).join(NEWLINE + NEWLINE);
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
  return joinSections(sections);
}

/** A requirement as a section of a prompt: its heading and its whole text. */
function requirementSection({ id, title, body }: { id: string; title: string; body: string[] }): string {
  return [`### ${id}: ${title}`, ...body].join(NEWLINE).trimEnd();
}

/** The heading of the list of the design notes of the project, which the agent searches instead of receiving their text. */
const DESIGN_HEADING = "Design notes (search these files for the terms of the requirement with your read and grep tools):";

/** The prompt of a feature-writing task: the whole text of the requirement, the non-functional requirements, the domain notes, the paths of the design notes to search, and the feature files that exist, for style; no code and no test. */
export function featureWriteContext(cwd: string, task: { fr: string; comment?: string }): string {
  const { paths } = loadProjectConfig(cwd);
  const requirements = parseRequirements(readText(cwd, paths.spec) ?? "");
  const requirement = requirements.filter(({ id }) => id === task.fr);
  const nonFunctional = requirements.filter(({ id }) => id.startsWith("NFR-"));
  const features = readFeatureSources(cwd, paths.bdd_features).map(({ path, text }) => [`### ${path}`, text].join(NEWLINE));
  const designNotes = globSync(paths.design, { cwd }).sort();
  const sections = [
    ["Requirement:", ...requirement.map(requirementSection)],
    ["Non-functional requirements:", ...nonFunctional.map(requirementSection)],
    ["Domain notes:", readText(cwd, DOMAIN_FILE) ?? ""],
    ...(designNotes.length === 0 ? [] : [[DESIGN_HEADING, designNotes.map((file) => `- ${file}`).join(NEWLINE)]]),
    ["Feature files that exist, for style:", ...features],
    ...(task.comment === undefined ? [] : [["The person who reviewed your feature files rejected them with this comment:", task.comment]]),
  ];
  return sections.map((section) => section.join(NEWLINE + NEWLINE)).join(NEWLINE + NEWLINE);
}
