import type { FeatureSource } from "../../artifacts/traceability.js";

/** The most feature files given to the feature writer as examples. */
const MAX_EXAMPLES = 3;

/** How many parts a list is cut in two by its middle. */
const HALVES = 2;

const FEATURE_TAG = /@(?<id>FR-(?<area>[A-Z0-9]+)-(?<number>\d+)[a-z]?)/;
const REQUIREMENT_ID = /^FR-(?<area>[A-Z0-9]+)-(?<number>\d+)/;

/** The requirement a feature file is tagged with, and its area and number. */
function taggedWith({ text }: FeatureSource): { id: string; area: string; number: number } | undefined {
  const tag = FEATURE_TAG.exec(text)?.groups;
  return tag === undefined ? undefined : { id: tag.id!, area: tag.area!, number: Number(tag.number) };
}

/** The files at the start, the middle and the end of the list: a spread of the whole list. */
function spread(sources: FeatureSource[]): FeatureSource[] {
  return [...new Set([sources[0], sources[Math.floor(sources.length / HALVES)], sources.at(-1)])].filter((source): source is FeatureSource => source !== undefined);
}

/** The feature files to show the feature writer as examples of style: those of the same area as the requirement, the nearest in number first, then a spread of the others; never the requirement's own file, and at most three. */
export function exampleFeatures(sources: FeatureSource[], fr: string): FeatureSource[] {
  const target = REQUIREMENT_ID.exec(fr)?.groups;
  const others = sources.filter((source) => taggedWith(source)?.id !== fr);
  const near = others
    .filter((source) => target !== undefined && taggedWith(source)?.area === target.area)
    .map((source) => ({ source, distance: Math.abs(taggedWith(source)!.number - Number(target!.number)) }))
    .sort((a, b) => a.distance - b.distance || a.source.path.localeCompare(b.source.path))
    .map(({ source }) => source);
  return [...near, ...spread(others.filter((source) => !near.includes(source)))].slice(0, MAX_EXAMPLES);
}
