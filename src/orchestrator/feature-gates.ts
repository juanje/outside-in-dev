import { type Rejection, rejection } from "../artifacts/rejection.js";
import { checkTraceability, listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";
import { LIST_SEPARATOR } from "../ui/plain.js";

const UNKNOWN_TAG = "unknown tag @";
const SYNTAX_ERROR = "Gherkin syntax error: ";
const TAG_SEPARATOR = " ";
const NO_TAGS = "none";

/** Why the feature files an agent wrote for the requirement `fr` are not acceptable, or `undefined` when they pass the gates. */
export function featureProblem(cwd: string, fr: string, files: string[], knownIds: string[]): Rejection | undefined {
  const sources = readFeatureSources(cwd, files);
  const violations = checkTraceability(sources, knownIds);
  const syntax = violations.find(({ kind }) => kind.startsWith(SYNTAX_ERROR));
  if (syntax !== undefined) {
    return rejection({ failed: `${syntax.file} does not parse`, evidence: syntax.kind.slice(SYNTAX_ERROR.length), next: `fix the Gherkin syntax of ${syntax.file} so that it parses, then write the feature files again` });
  }
  const unknown = violations.find(({ kind }) => kind.startsWith(UNKNOWN_TAG));
  if (unknown !== undefined) {
    const tag = unknown.kind.slice(UNKNOWN_TAG.length);
    return rejection({ failed: `${tag} is not in SPEC.md`, evidence: `tag: @${tag}`, next: `use only the requirement ids that SPEC.md defines: ${knownIds.join(LIST_SEPARATOR)}` });
  }
  const scenarios = listLocatedScenarios(sources);
  if (scenarios.length === 0) {
    return rejection({ failed: "the feature files have no scenario", evidence: `feature files: ${files.join(LIST_SEPARATOR)}`, next: `write at least one scenario for ${fr} in a feature file` });
  }
  const untraced = scenarios.find(({ tags }) => !tags.includes(`@${fr}`));
  if (untraced === undefined) return undefined;
  return rejection({ failed: `scenario "${untraced.name}" of ${untraced.file} is not traced to ${fr}`, evidence: `tags of the scenario: ${untraced.tags.join(TAG_SEPARATOR) || NO_TAGS}`, next: `tag the scenario or its feature with @${fr}` });
}
