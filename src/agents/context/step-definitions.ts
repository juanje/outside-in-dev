import { NEWLINE } from "../../artifacts/lines.js";
import { escapeRegExp } from "../../artifacts/regexp.js";

/** A step definition found in the text of a step file: how it is declared (its keyword and the text or pattern of the step), the expression that tells which steps it runs, if it could be read, and its whole text. */
export type StepDefinition = { declaration: string; expression: RegExp | undefined; text: string };

const DEFINITION_START = /^(?<keyword>Given|When|Then|defineStep)\(\s*(?<literal>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/(?:[^/\\\r\n]|\\.)+\/[a-z]*)/gm;

/** A step pattern written as a regular expression: its source and its flags. */
const REGEXP_LITERAL = /^\/(?<source>.+)\/(?<flags>[a-z]*)$/;

const STEP_LINE = /^\s*(?:Given|When|Then|And|But|\*)\s+(.*)$/;

/** What a parameter of a step pattern, as `{int}`, matches. */
const PARAMETERS: Record<string, string> = { "{string}": `(?:"[^"]*"|'[^']*')`, "{int}": "-?\\d+", "{float}": "-?\\d*\\.?\\d+", "{word}": "\\S+" };

/** The part of a step pattern that the cucumber expression gives a meaning to: a parameter, or optional text in parentheses. */
const EXPRESSION_PART = /(\{[^}]*\}|\([^)]*\))/;

/** The regular expression of a step pattern written as a literal: a regular expression as it is, a cucumber expression turned into one; undefined when it cannot be read. */
function expressionOf(literal: string): RegExp | undefined {
  try {
    const regexp = REGEXP_LITERAL.exec(literal)?.groups;
    if (regexp !== undefined) return new RegExp(regexp.source!, regexp.flags!.replace(/[gy]/g, ""));
    const text = literal.startsWith('"') ? (JSON.parse(literal) as string) : literal.slice(1, -1).replace(/\\(.)/g, "$1");
    const parts = text.split(EXPRESSION_PART).map((part) => (part.startsWith("{") ? (PARAMETERS[part] ?? ".*") : part.startsWith("(") ? `(?:${escapeRegExp(part.slice(1, -1))})?` : escapeRegExp(part)));
    return new RegExp(`^${parts.join("")}$`);
  } catch {
    return undefined;
  }
}

/** The step definitions a step file declares at the start of a line, each from its declaration to the one that follows. */
export function stepDefinitions(source: string): StepDefinition[] {
  const starts = [...source.matchAll(DEFINITION_START)];
  return starts.map((start, index) => {
    const { keyword, literal } = start.groups!;
    return { declaration: `${keyword}(${literal})`, expression: expressionOf(literal!), text: source.slice(start.index, starts[index + 1]?.index).trimEnd() };
  });
}

const DOC_STRING = /^\s*(?:"""|```)/;
const BACKGROUND_START = /^\s*Background:/;
const BACKGROUND_END = /^\s*(?:@|Scenario|Rule|Example)/;

/** The text of each step of some lines of a feature file, without its keyword; a line inside a doc string is not a step. */
function linesSteps(lines: string[]): string[] {
  let inDocString = false;
  return lines.flatMap((line) => {
    if (DOC_STRING.test(line)) inDocString = !inDocString;
    return inDocString ? [] : (STEP_LINE.exec(line)?.[1] ?? []);
  });
}

/** The text of each step of a scenario and of the Background of its feature file, without their keywords. */
export function stepTexts(feature: string, scenario: string): string[] {
  const lines = feature.split(NEWLINE);
  const start = lines.findIndex((line) => BACKGROUND_START.test(line));
  const end = lines.findIndex((line, index) => index > start && BACKGROUND_END.test(line));
  const background = start < 0 ? [] : lines.slice(start, end < 0 ? undefined : end);
  return linesSteps([...background, ...scenario.split(NEWLINE)]);
}

/** Whether a step definition is the one a step of a scenario runs. */
export function isDefinitionOf(definition: StepDefinition, step: string): boolean {
  return definition.expression?.test(step) ?? false;
}
