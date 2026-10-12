import { NEWLINE } from "../../artifacts/lines.js";
import type { FeatureSource } from "../../artifacts/traceability.js";
import { overlap, termsOf, termWeights } from "./relevance.js";
import { featureStepTexts, isDefinitionOf, stepDefinitions } from "./step-definitions.js";

/** The most characters of step patterns given to the feature writer, headings included; the step files that do not fit are listed by path. */
export const STEP_CATALOGUE_BUDGET = 8000;

/** A step file of the project and its text. */
export type StepFile = { file: string; source: string };

/** What puts a step first in the catalogue: the example features that use it, and the requirement it shares terms with. */
export type StepCatalogueTask = { examples: FeatureSource[]; requirement: string; budget: number };

/** The line that lists the step files with a step left out. */
const LEFT_OUT = "Step files not shown (read one when you need its steps): ";

/** The line of a step file in the catalogue. */
const headingLine = (file: string): string => `### ${file}`;

/** The line of a step definition in the catalogue. */
const entryLine = ({ declaration }: { declaration: string }): string => `- ${declaration}`;

/** What separates the names in a list. */
const LIST_SEPARATOR = ", ";

/** The step definitions that exist, by pattern and never by body, grouped by step file and within the budget. The steps that the example features use come first, then those that share the most distinctive terms with the requirement, then the rest in the order of the files; a last line lists the files with a step left out. */
export function stepCatalogue(stepFiles: StepFile[], task: StepCatalogueTask): string {
  const defined = stepFiles.flatMap(({ file, source }) => stepDefinitions(source).map((definition) => ({ file, definition })));
  const used = task.examples.flatMap(({ text }) => featureStepTexts(text));
  const terms = defined.map(({ definition }) => termsOf(definition.declaration));
  const weights = termWeights(terms);
  const query = new Map([...termsOf(task.requirement)].map((term) => [term, 1]));
  const ranked = defined
    .map((entry, index) => ({ ...entry, index, isUsed: used.some((step) => isDefinitionOf(entry.definition, step)), score: overlap(terms[index]!, query, weights) }))
    .sort((a, b) => Number(b.isUsed) - Number(a.isUsed) || b.score - a.score || a.index - b.index);
  let size = 0;
  const shown = new Set<number>();
  const started = new Set<string>();
  for (const { file, definition, index } of ranked) {
    const cost = entryLine(definition).length + NEWLINE.length + (started.has(file) ? 0 : headingLine(file).length + NEWLINE.length);
    if (size + cost > task.budget) continue;
    size += cost;
    started.add(file);
    shown.add(index);
  }
  const sections = [...started].map((file) => [headingLine(file), ...defined.filter((entry, index) => entry.file === file && shown.has(index)).map(({ definition }) => entryLine(definition))].join(NEWLINE));
  const leftOut = [...new Set(defined.filter((_, index) => !shown.has(index)).map(({ file }) => file))];
  return [...sections, ...(leftOut.length === 0 ? [] : [`${LEFT_OUT}${leftOut.join(LIST_SEPARATOR)}`])].join(NEWLINE + NEWLINE);
}
