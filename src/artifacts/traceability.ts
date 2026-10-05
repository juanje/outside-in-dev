import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator, type Scenario, type Tag } from "@cucumber/messages";

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

export function checkTraceability(sources: FeatureSource[], knownIds: string[]): TraceabilityViolation[] {
  const violations: TraceabilityViolation[] = [];
  for (const { path, text } of sources) {
    const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
    const feature = parser.parse(text).feature;
    if (!feature) continue;
    const scenarios: { scenario: Scenario; inherited: readonly Tag[] }[] = [];
    for (const { rule, scenario } of feature.children) {
      if (scenario) scenarios.push({ scenario, inherited: feature.tags });
      if (!rule) continue;
      for (const ruleChild of rule.children) {
        if (ruleChild.scenario) {
          scenarios.push({ scenario: ruleChild.scenario, inherited: [...feature.tags, ...rule.tags] });
        }
      }
    }
    for (const { scenario, inherited } of scenarios) {
      const tags = [...inherited, ...scenario.tags];
      if (!tags.some(({ name }) => name.startsWith("@FR-"))) {
        violations.push({ file: path, scenario: scenario.name, kind: "no @FR tag" });
      }
      for (const { name } of tags) {
        if (REQUIREMENT_TAG.test(name) && !knownIds.includes(name.slice(1))) {
          violations.push({ file: path, scenario: scenario.name, kind: `unknown tag ${name}` });
        }
      }
    }
  }
  return violations;
}
