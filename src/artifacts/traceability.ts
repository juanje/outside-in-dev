import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";

const REQUIREMENT_TAG = /^@(?:FR|NFR)-/;

export interface FeatureSource {
  path: string;
  text: string;
}

export interface TraceabilityViolation {
  file: string;
  scenario: string;
  kind: string;
}

export interface ListedScenario {
  file: string;
  name: string;
  tags: string[];
}

const PARSER_ERRORS_HEADING = "Parser errors:";

function parseFeature(text: string) {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  try {
    return { feature: parser.parse(text).feature };
  } catch (error) {
    const detail = String(error instanceof Error ? error.message : error)
      .split("\n")
      .filter((line) => line.trim() !== "" && line !== PARSER_ERRORS_HEADING)
      .join("; ");
    return { error: detail };
  }
}

/** Lists every scenario of the feature files with its effective tags (Feature, Rule, own). */
export function listScenarios(sources: FeatureSource[]): ListedScenario[] {
  const listed: ListedScenario[] = [];
  for (const { path, text } of sources) {
    const { feature } = parseFeature(text);
    if (!feature) continue;
    for (const { rule, scenario } of feature.children) {
      const found = [
        ...(scenario ? [{ scenario, inherited: feature.tags }] : []),
        ...(rule?.children ?? []).flatMap(({ scenario: nested }) =>
          nested ? [{ scenario: nested, inherited: [...feature.tags, ...rule!.tags] }] : [],
        ),
      ];
      for (const { scenario: item, inherited } of found) {
        listed.push({ file: path, name: item.name, tags: [...inherited, ...item.tags].map(({ name }) => name) });
      }
    }
  }
  return listed;
}

export function checkTraceability(sources: FeatureSource[], knownIds: string[]): TraceabilityViolation[] {
  const violations: TraceabilityViolation[] = [];
  for (const { path, text } of sources) {
    const { error } = parseFeature(text);
    if (error !== undefined) violations.push({ file: path, scenario: "", kind: `Gherkin syntax error: ${error}` });
  }
  for (const { file, name, tags } of listScenarios(sources)) {
    if (!tags.some((tag) => tag.startsWith("@FR-"))) {
      violations.push({ file, scenario: name, kind: "no @FR tag" });
    }
    for (const tag of tags) {
      if (REQUIREMENT_TAG.test(tag) && !knownIds.includes(tag.slice(1))) {
        violations.push({ file, scenario: name, kind: `unknown tag ${tag}` });
      }
    }
  }
  return violations;
}
