import { NEWLINE } from "../../artifacts/lines.js";
import { escapeRegExp } from "../../artifacts/regexp.js";

/** A step definition found in the text of a step file: how it is declared (its keyword and the text or pattern of the step), the expression that tells which steps it runs, if it could be read, and its whole text. */
export type StepDefinition = { declaration: string; expression: RegExp | undefined; text: string };

const DEFINITION_START = /^(?<keyword>Given|When|Then|defineStep)\(\s*(?<literal>"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/(?:[^/\\\r\n]|\\.)+\/[a-z]*)/gm;

/** A step pattern written as a regular expression: its source and its flags. */
const REGEXP_LITERAL = /^\/(?<source>.+)\/(?<flags>[a-z]*)$/;

const STEP_LINE = /^\s*(?<keyword>Given|When|Then|And|But|\*)\s+(?<text>.*)$/;

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

/** The step definitions a step file declares at the start of a line, each from its declaration to the one that follows, with the line (from 1) where it starts. */
function locatedDefinitions(source: string): { definition: StepDefinition; line: number }[] {
  const starts = [...source.matchAll(DEFINITION_START)];
  return starts.map((start, index) => {
    const { keyword, literal } = start.groups!;
    const definition = { declaration: `${keyword}(${literal})`, expression: expressionOf(literal!), text: source.slice(start.index, starts[index + 1]?.index).trimEnd() };
    return { definition, line: source.slice(0, start.index).split(NEWLINE).length };
  });
}

/** The step definitions a step file declares at the start of a line, each from its declaration to the one that follows. */
export function stepDefinitions(source: string): StepDefinition[] {
  return locatedDefinitions(source).map(({ definition }) => definition);
}

/** The step definition of a step file that holds the line `line` (from 1); undefined when the line is outside every definition. */
export function definitionAtLine(source: string, line: number): StepDefinition | undefined {
  const holder = locatedDefinitions(source).filter((located) => located.line <= line).at(-1);
  return holder !== undefined && line < holder.line + holder.definition.text.split(NEWLINE).length ? holder.definition : undefined;
}

const DOC_STRING = /^\s*(?:"""|```)/;
const BACKGROUND_START = /^\s*Background:/;
const BACKGROUND_END = /^\s*(?:@|Scenario|Rule|Example)/;

/** The keyword and the text of each step of some lines of a feature file; a line inside a doc string is not a step. */
function keyedSteps(lines: string[]): { keyword: string; text: string }[] {
  let inDocString = false;
  return lines.flatMap((line) => {
    if (DOC_STRING.test(line)) inDocString = !inDocString;
    const { keyword, text } = inDocString ? {} : (STEP_LINE.exec(line)?.groups ?? {});
    return keyword === undefined ? [] : [{ keyword, text: text! }];
  });
}

/** The text of each step of some lines of a feature file, without its keyword; a line inside a doc string is not a step. */
function linesSteps(lines: string[]): string[] {
  return keyedSteps(lines).map(({ text }) => text);
}

/** The keywords of the steps that go on with the kind of the step before them. */
const CONTINUING_KEYWORD = /^(?:And|But|\*)$/;

/** The text of each step of a scenario that checks an outcome, without its keyword: the Then steps and the And and But steps that follow one. */
export function thenTexts(scenario: string): string[] {
  let outcome = false;
  return keyedSteps(scenario.split(NEWLINE)).flatMap(({ keyword, text }) => {
    outcome = keyword === "Then" || (outcome && CONTINUING_KEYWORD.test(keyword));
    return outcome ? [text] : [];
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
