import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import { globSync } from "tinyglobby";

const REQUIREMENT_TAG = /^@(?:FR|NFR)-/;

export interface FeatureSource {
  path: string;
  text: string;
}

/** The feature files that match the globs, sorted, with their text. */
export function readFeatureSources(cwd: string, globs: string[]): FeatureSource[] {
  return globSync(globs, { cwd })
    .sort()
    .map((path) => ({ path, text: readFileSync(join(cwd, path), "utf8") }));
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

export interface LocatedScenario extends ListedScenario {
  /** The line where the scenario starts. */
  line: number;
}

const PARSER_ERRORS_HEADING = "Parser errors:";

export function parseFeature(text: string) {
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
  return listLocatedScenarios(sources).map(({ line: _line, ...scenario }) => scenario);
}

/** Lists every scenario of the feature files with its effective tags and the line where it starts. */
export function listLocatedScenarios(sources: FeatureSource[]): LocatedScenario[] {
  const listed: LocatedScenario[] = [];
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
        listed.push({ file: path, name: item.name, line: item.location.line, tags: [...inherited, ...item.tags].map(({ name }) => name) });
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
