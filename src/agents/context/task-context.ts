import { globSync } from "tinyglobby";
import { NEWLINE } from "../../artifacts/lines.js";
import { loadProjectConfig } from "../../artifacts/project-config.js";
import { readText } from "../../artifacts/project-json.js";
import { listLocatedScenarios, readFeatureSources } from "../../artifacts/traceability.js";
import { parseRequirements } from "../../artifacts/spec.js";
import { exampleFeatures } from "./example-features.js";
import { importClosure } from "./import-closure.js";
import { isDefinitionOf, stepDefinitions, stepTexts } from "./step-definitions.js";
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
  return [`Scenario (${file}:${line}):`, scenarioText(cwd, task.scenario), "Current failure of the scenario (your starting point):", task.failure, CATALOGUE_HEADING, reuseCatalogue(cwd)].join(NEWLINE + NEWLINE);
}

/** A file of the project as a section of a prompt: its path and its whole text. */
export function fileSection(cwd: string, file: string): string {
  return [`### ${file}`, readText(cwd, file) ?? ""].join(NEWLINE);
}

/** The heading of the list of the step files of the project, which the agent reads when a pattern is not enough to reuse a step. */
const STEP_FILES_HEADING = "Step definition files (read the one that holds a step you want to reuse):";

/** The heading of the list of the step definitions that exist, each by its declaration and not its body, so that a new step reuses an existing one. */
const STEP_PATTERNS_HEADING = "Step definitions that exist (the text or pattern of each):";

/** The heading of the definitions, in full, of the steps the scenario already uses, so that the agent reuses them correctly. */
const STEPS_USED_HEADING = "Step definitions the scenario already uses:";

/** The prompt of a BDD Red task: the scenario with its location, the step files and the pattern of each step definition that exists, and the public signatures of the project; no unit test, no body of the source and no other scenario. */
export function bddRedContext(cwd: string, scenario: ScenarioLocation): string {
  const files = globSync(loadProjectConfig(cwd).paths.bdd_steps, { cwd }).sort();
  const defined = files.flatMap((file) => stepDefinitions(readText(cwd, file) ?? "").map((definition) => ({ file, definition })));
  const steps = stepTexts(readText(cwd, scenario.file) ?? "", scenarioText(cwd, scenario));
  const used = defined.filter(({ definition }) => steps.some((step) => isDefinitionOf(definition, step)));
  const failure = "The scenario has no step definitions yet.";
  return joinSections([
    [testTaskContext(cwd, { scenario, failure })],
    [STEP_FILES_HEADING, files.map((file) => `- ${file}`).join(NEWLINE)],
    [STEP_PATTERNS_HEADING, defined.map(({ definition }) => definition.declaration).join(NEWLINE)],
    ...(used.length === 0 ? [] : [[STEPS_USED_HEADING, ...used.map(({ file, definition }) => [`### ${file}`, definition.text].join(NEWLINE))]]),
  ]);
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
    ["Current failure of the test (your starting point):", task.failure],
    ["Source the tests import:", ...imported.map((file) => fileSection(cwd, file))],
    [CATALOGUE_HEADING, reuseCatalogue(cwd, { used: imported, mentions: task.failure })],
  ];
  return joinSections(sections);
}

/** A requirement as a section of a prompt: its heading and its whole text. */
function requirementSection({ id, title, body }: { id: string; title: string; body: string[] }): string {
  return [`### ${id}: ${title}`, ...body].join(NEWLINE).trimEnd();
}

/** The heading of the list of the design notes of the project, which the agent searches instead of receiving their text. */
const DESIGN_HEADING = "Design notes (search these files for the terms of the requirement with your read and grep tools):";

/** The heading of the list of every feature file of the project, which the agent reads when the examples do not show enough. */
const FEATURE_LIST_HEADING = "All the feature files of the project (read any of them with your read tool):";

/** The prompt of a feature-writing task: the whole text of the requirement, the non-functional requirements, the domain notes, the paths of the design notes to search, and the feature files that exist, for style; no code and no test. */
export function featureWriteContext(cwd: string, task: { fr: string; comment?: string }): string {
  const { paths } = loadProjectConfig(cwd);
  const requirements = parseRequirements(readText(cwd, paths.spec) ?? "");
  const requirement = requirements.filter(({ id }) => id === task.fr);
  const nonFunctional = requirements.filter(({ id }) => id.startsWith("NFR-"));
  const sources = readFeatureSources(cwd, paths.bdd_features);
  const features = exampleFeatures(sources, task.fr).map(({ path, text }) => [`### ${path}`, text].join(NEWLINE));
  const designNotes = globSync(paths.design, { cwd }).sort();
  const sections = [
    ["Requirement:", ...requirement.map(requirementSection)],
    ["Non-functional requirements:", ...nonFunctional.map(requirementSection)],
    ["Domain notes:", readText(cwd, DOMAIN_FILE) ?? ""],
    ...(designNotes.length === 0 ? [] : [[DESIGN_HEADING, designNotes.map((file) => `- ${file}`).join(NEWLINE)]]),
    ["Example feature files, for style:", ...features],
    [FEATURE_LIST_HEADING, sources.map(({ path }) => `- ${path}`).join(NEWLINE)],
    ...(task.comment === undefined ? [] : [["The person who reviewed your feature files rejected them with this comment:", task.comment]]),
  ];
  return sections.map((section) => section.join(NEWLINE + NEWLINE)).join(NEWLINE + NEWLINE);
}
