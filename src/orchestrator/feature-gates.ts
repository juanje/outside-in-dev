import { checkTraceability, listLocatedScenarios, readFeatureSources } from "../artifacts/traceability.js";

const UNKNOWN_TAG = "unknown tag @";
const SYNTAX_ERROR = "Gherkin syntax error: ";

/** Why the feature files an agent wrote for the requirement `fr` are not acceptable, or `undefined` when they pass the gates. */
export function featureProblem(cwd: string, fr: string, files: string[], knownIds: string[]): string | undefined {
  const sources = readFeatureSources(cwd, files);
  const violations = checkTraceability(sources, knownIds);
  const syntax = violations.find(({ kind }) => kind.startsWith(SYNTAX_ERROR));
  if (syntax !== undefined) return `${syntax.file} does not parse: ${syntax.kind.slice(SYNTAX_ERROR.length)}`;
  const unknown = violations.find(({ kind }) => kind.startsWith(UNKNOWN_TAG));
  if (unknown !== undefined) return `${unknown.kind.slice(UNKNOWN_TAG.length)} is not in SPEC.md`;
  const scenarios = listLocatedScenarios(sources);
  if (scenarios.length === 0) return "the feature files have no scenario";
  const untraced = scenarios.find(({ tags }) => !tags.includes(`@${fr}`));
  return untraced === undefined ? undefined : `scenario "${untraced.name}" of ${untraced.file} is not traced to ${fr}`;
}
