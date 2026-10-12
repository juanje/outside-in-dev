import { NEWLINE } from "../../artifacts/lines.js";
import type { FeatureSource } from "../../artifacts/traceability.js";
import { overlap, termsOf, termWeights } from "./relevance.js";

/** The most feature files given to the feature writer as examples. */
const MAX_EXAMPLES = 3;

/** How much a term of a design passage weighs next to a term of the requirement itself. */
const DESIGN_WEIGHT = 0.25;

/** The most design passages whose terms count in the choice of examples. */
export const MAX_DESIGN_PASSAGES = 3;

const FEATURE_TAG = /@(?<id>FR-(?<area>[A-Z0-9]+)-\d+[a-z]?)/;
const REQUIREMENT_AREA = /^FR-(?<area>[A-Z0-9]+)-/;
const PARAGRAPH_BREAK = /\n\s*\n/;

/** The shortest paragraph that can be a design passage: a shorter one is a heading or a label. */
const MIN_PASSAGE_LENGTH = 80;

/** What a table, a heading or a listing starts with, which a passage does not. */
const NOT_PROSE = /^(?:[|#]|\s*```)/;

/** The longest paragraph that can be a design passage: a longer one is a table, a listing or a section that tells too many things to tell one. */
const MAX_PASSAGE_LENGTH = 1500;

/** The requirement a feature file is tagged with, and its area. */
function taggedWith({ text }: FeatureSource): { id: string; area: string } | undefined {
  const tag = FEATURE_TAG.exec(text)?.groups;
  return tag === undefined ? undefined : { id: tag.id!, area: tag.area! };
}

/** What a feature-writing task says about the requirement: its text, and the design passages that give it more words. */
export type RequirementText = { requirement: string; design: string[] };

/** The paragraphs of the design notes (not the requirement's own, and not a table or a listing) that share the most distinctive terms with the requirement, the best first; at most `count`, and none that shares nothing. */
export function designPassages(notes: string[], requirement: string, count: number): string[] {
  const paragraphs = notes
    .flatMap((note) => note.split(PARAGRAPH_BREAK))
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= MIN_PASSAGE_LENGTH && paragraph.length <= MAX_PASSAGE_LENGTH && !NOT_PROSE.test(paragraph) && !requirement.includes(paragraph));
  const terms = paragraphs.map(termsOf);
  const weights = termWeights(terms);
  const query = new Map([...termsOf(requirement)].map((term) => [term, 1]));
  return paragraphs
    .map((paragraph, index) => ({ paragraph, index, score: overlap(terms[index]!, query, weights) / Math.sqrt(terms[index]!.size) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map(({ paragraph }) => paragraph);
}

/** The terms of the requirement and of its design passages, each with its weight in the choice of examples. */
function queryOf({ requirement, design }: RequirementText): Map<string, number> {
  const query = new Map([...termsOf(design.join(NEWLINE))].map((term) => [term, DESIGN_WEIGHT]));
  for (const term of termsOf(requirement)) query.set(term, 1);
  return query;
}

/** The feature files to show the feature writer as examples: those that share the most distinctive terms with the requirement and its design passages (a term held by few files weighs more); a tie goes to the file of the same area as the requirement, then to the path; never the requirement's own file, and at most three. */
export function exampleFeatures(sources: FeatureSource[], fr: string, about: RequirementText): FeatureSource[] {
  const area = REQUIREMENT_AREA.exec(fr)?.groups?.area;
  const others = sources.filter((source) => taggedWith(source)?.id !== fr);
  const terms = others.map(({ text }) => termsOf(text));
  const weights = termWeights(terms);
  const query = queryOf(about);
  return others
    .map((source, index) => ({ source, score: overlap(terms[index]!, query, weights) / Math.sqrt(terms[index]!.size), sameArea: taggedWith(source)?.area === area }))
    .sort((a, b) => b.score - a.score || Number(b.sameArea) - Number(a.sameArea) || a.source.path.localeCompare(b.source.path))
    .slice(0, MAX_EXAMPLES)
    .map(({ source }) => source);
}
