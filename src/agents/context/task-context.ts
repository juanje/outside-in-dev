import { globSync } from "tinyglobby";
import { NEWLINE } from "../../artifacts/lines.js";
import { loadProjectConfig } from "../../artifacts/project-config.js";
import { readText } from "../../artifacts/project-json.js";
import { failingFrame } from "../../artifacts/cucumber-report.js";
import { listLocatedScenarios, readFeatureSources } from "../../artifacts/traceability.js";
import { parseRequirements } from "../../artifacts/spec.js";
import { conventionsSection } from "./conventions.js";
import { designPassages, exampleFeatures, MAX_DESIGN_PASSAGES } from "./example-features.js";
import { importClosure } from "./import-closure.js";
import { definitionAtLine, isDefinitionOf, type StepDefinition, stepDefinitions, stepTexts, thenTexts } from "./step-definitions.js";
import { reuseCatalogue } from "./reuse-catalogue.js";
import { STEP_CATALOGUE_BUDGET, stepCatalogue } from "./step-catalogue.js";

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

/** The heading of the definition of the step that the failure of the scenario names. */
const FAILING_STEP_HEADING = "Step definition that fails:";

/** The section of the step definition that holds the line of the first stack frame of the failure, with its file; none when the failure names no line of a step definition. */
function failingStepSection(cwd: string, failure: string): string[] {
  const frame = failingFrame(failure, cwd);
  const definition = frame === undefined ? undefined : definitionAtLine(readText(cwd, frame.file) ?? "", frame.line);
  return frame === undefined || definition === undefined ? [] : [FAILING_STEP_HEADING, boundedDefinitionSection(frame.file, definition)];
}

/** A step definition as a section of a prompt: its file and its whole text. */
function definitionSection(file: string, definition: { text: string }): string {
  return [`### ${file}`, definition.text].join(NEWLINE);
}

/** The most lines of a step definition that a test task shows of the step that fails; the others are counted. */
const MAX_DEFINITION_LINES = 60;

/** A step definition as a section of a prompt, cut after `MAX_DEFINITION_LINES` lines with a note that counts the others, so that a long one does not fill the task. */
function boundedDefinitionSection(file: string, definition: { text: string }): string {
  const lines = definition.text.split(NEWLINE);
  const rest = lines.length - MAX_DEFINITION_LINES;
  return definitionSection(file, { text: [...lines.slice(0, MAX_DEFINITION_LINES), ...(rest > 0 ? [`(${rest} more lines; read ${file} for the rest)`] : [])].join(NEWLINE) });
}

/** The step files of the project, sorted, and the step definitions each declares. */
function projectSteps(cwd: string): { files: string[]; defined: { file: string; definition: StepDefinition }[] } {
  const files = globSync(loadProjectConfig(cwd).paths.bdd_steps, { cwd }).sort();
  return { files, defined: files.flatMap((file) => stepDefinitions(readText(cwd, file) ?? "").map((definition) => ({ file, definition }))) };
}

/** The heading of the definitions of the steps of the scenario that check its outcome, for a failure that names no step definition. */
const THEN_STEPS_HEADING = "Step definitions of the Then steps of the scenario:";

/** The section of the whole definitions of the Then steps of the scenario, each with its file; none when no definition runs one. */
function thenStepsSection(cwd: string, scenario: ScenarioLocation): string[] {
  const steps = thenTexts(scenarioText(cwd, scenario));
  const outcome = projectSteps(cwd).defined.filter(({ definition }) => steps.some((step) => isDefinitionOf(definition, step)));
  return outcome.length === 0 ? [] : [THEN_STEPS_HEADING, ...outcome.map(({ file, definition }) => boundedDefinitionSection(file, definition))];
}

/** The prompt of a test task: the scenario with its location and the failure, the sections about step definitions, and the public signatures of the project. */
function testContext(cwd: string, task: { scenario: ScenarioLocation; failure: string }, stepSections: string[]): string {
  const { file, line } = task.scenario;
  const scenario = scenarioText(cwd, task.scenario);
  return [`Scenario (${file}:${line}):`, scenario, "Current failure of the scenario (your starting point):", task.failure, ...stepSections, CATALOGUE_HEADING, reuseCatalogue(cwd, { mentions: `${scenario}${NEWLINE}${task.failure}` }), ...conventionsSection(cwd)].join(NEWLINE + NEWLINE);
}

/** The prompt of a TDD Red task: the scenario with its location and the normalised failure, the whole definition of the step the failure names (else those of the scenario's Then steps), and the public signatures of the project; no body of the source and no other scenario. */
export function testTaskContext(cwd: string, task: { scenario: ScenarioLocation; failure: string }): string {
  const failing = failingStepSection(cwd, task.failure);
  return testContext(cwd, task, failing.length > 0 ? failing : thenStepsSection(cwd, task.scenario));
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
  const { files, defined } = projectSteps(cwd);
  const steps = stepTexts(readText(cwd, scenario.file) ?? "", scenarioText(cwd, scenario));
  const used = defined.filter(({ definition }) => steps.some((step) => isDefinitionOf(definition, step)));
  const failure = "The scenario has no step definitions yet.";
  return joinSections([
    [testContext(cwd, { scenario, failure }, [])],
    [STEP_FILES_HEADING, files.map((file) => `- ${file}`).join(NEWLINE)],
    [STEP_PATTERNS_HEADING, defined.map(({ definition }) => definition.declaration).join(NEWLINE)],
    ...(used.length === 0 ? [] : [[STEPS_USED_HEADING, ...used.map(({ file, definition }) => definitionSection(file, definition))]]),
  ]);
}

/** The sections of a prompt as text, each one's lines and the sections themselves apart by a blank line; a section with no lines is left out. */
export function joinSections(sections: string[][]): string {
  return sections.filter((section) => section.length > 0).map((section) => section.join(NEWLINE + NEWLINE)).join(NEWLINE + NEWLINE);
}

/** The prompt of an implementation task (CODE_GREEN): the failing tests in full, the normalised failure, the source files the tests import and the reuse catalogue; no other scenario and no earlier attempt. */
export function implementationContext(cwd: string, task: { tests: string[]; failure: string }): string {
  const imported = importClosure(cwd, task.tests, loadProjectConfig(cwd).paths.source);
  const sections = [
    ["Failing tests:", ...task.tests.map((test) => fileSection(cwd, test))],
    ["Current failure of the test (your starting point):", task.failure],
    ["Source the tests import:", ...imported.map((file) => fileSection(cwd, file))],
    [CATALOGUE_HEADING, reuseCatalogue(cwd, { used: imported, mentions: task.failure })],
    conventionsSection(cwd),
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

/** The heading of the step definitions that exist, by pattern: a scenario written with them runs on a setup that already works, and each new step is code the next step must write and keep. */
const STEP_CATALOGUE_HEADING = "Step definitions that exist (the steps of the project, by pattern; prefer them: a scenario written with existing steps runs on a setup that already works, and each new step is code that the next step must write and keep; write a new step only for what none of them says):";

/** The prompt of a feature-writing task: the whole text of the requirement, the non-functional requirements, the domain notes, the paths of the design notes to search, the feature files that are the closest to the requirement, for style, the patterns of the step definitions that exist and the paths of all the feature files; no code and no test. */
export function featureWriteContext(cwd: string, task: { fr: string; comment?: string }): string {
  const { paths } = loadProjectConfig(cwd);
  const requirements = parseRequirements(readText(cwd, paths.spec) ?? "");
  const requirement = requirements.filter(({ id }) => id === task.fr);
  const nonFunctional = requirements.filter(({ id }) => id.startsWith("NFR-"));
  const sources = readFeatureSources(cwd, paths.bdd_features);
  const designNotes = globSync(paths.design, { cwd }).sort();
  const requirementText = requirement.map(requirementSection).join(NEWLINE);
  const passages = designPassages(designNotes.map((file) => readText(cwd, file) ?? ""), requirementText, MAX_DESIGN_PASSAGES);
  const examples = exampleFeatures(sources, task.fr, { requirement: requirementText, design: passages });
  const features = examples.map(({ path, text }) => [`### ${path}`, text].join(NEWLINE));
  const stepFiles = projectSteps(cwd).files.map((file) => ({ file, source: readText(cwd, file) ?? "" }));
  const sections = [
    ["Requirement:", ...requirement.map(requirementSection)],
    ["Non-functional requirements:", ...nonFunctional.map(requirementSection)],
    ["Domain notes:", readText(cwd, DOMAIN_FILE) ?? ""],
    ...(designNotes.length === 0 ? [] : [[DESIGN_HEADING, designNotes.map((file) => `- ${file}`).join(NEWLINE)]]),
    ["Example feature files, for style:", ...features],
    ...(stepFiles.length === 0 ? [] : [[STEP_CATALOGUE_HEADING, stepCatalogue(stepFiles, { examples, requirement: requirementText, budget: STEP_CATALOGUE_BUDGET })]]),
    [FEATURE_LIST_HEADING, sources.map(({ path }) => `- ${path}`).join(NEWLINE)],
    conventionsSection(cwd),
    ...(task.comment === undefined ? [] : [["The person who reviewed your feature files rejected them with this comment:", task.comment]]),
  ];
  return joinSections(sections);
}
