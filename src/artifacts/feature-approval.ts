import { parseFeature } from "./traceability.js";

/** What a violation names when the change is to the parts of a feature file that belong to no scenario. */
export const OUTSIDE_SCENARIOS = "the parts outside scenarios";
/** What a violation names when the file is judged as a whole (duplicate scenario names, or a file that cannot be parsed). */
export const WHOLE_FILE = "the whole file";

/** Whether a scenario, given its name and its effective tags, is approved. */
export type IsApproved = (name: string, tags: string[]) => boolean;

/** A scenario of a feature file: its text, without positions and ids, and its effective tags. */
interface Part {
  text: string;
  tags: string[];
}

/** A feature file read for the comparison: its scenarios by name and everything that is outside them. */
interface Reading {
  scenarios: Map<string, Part>;
  /** Every scenario with its name, also when two have the same one. */
  all: Array<[string, Part]>;
  frame: string;
  /** Whether the file must be judged as a whole: it cannot be parsed, or two scenarios have the same name. */
  whole: boolean;
}

/** The keys of the AST that only say where a node is or how it is numbered. */
const POSITION_KEY = /^(?:id|location)$/;
const PARSE_ERROR = "error";

/** The AST of a part as text, without what only says where it is or how it is numbered. */
function plain(node: unknown): string {
  return JSON.stringify(node, (key, value: unknown) => (POSITION_KEY.test(key) ? undefined : value));
}

function names(tags: readonly { name: string }[]): string[] {
  return tags.map(({ name }) => name);
}

type Feature = NonNullable<ReturnType<typeof parseFeature>["feature"]>;

/** Every scenario of the feature, also those of its rules, with its effective tags. */
function scenariosOf(feature: Feature): Array<[string, Part]> {
  return feature.children.flatMap(({ scenario, rule }) => {
    const own = scenario ? [[scenario.name, { text: plain(scenario), tags: [...names(feature.tags), ...names(scenario.tags)] }] as [string, Part]] : [];
    const nested = (rule?.children ?? []).flatMap(({ scenario: inner }) =>
      inner ? [[inner.name, { text: plain(inner), tags: [...names(feature.tags), ...names(rule!.tags), ...names(inner.tags)] }] as [string, Part]] : [],
    );
    return [...own, ...nested];
  });
}

/** What belongs to no scenario: the feature line and tags, the description, the backgrounds and the headers of the rules. */
function frameOf(feature: Feature): string {
  const parts = feature.children.flatMap(({ background, rule }) => [
    ...(background ? [plain(background)] : []),
    ...(rule ? [plain({ ...rule, children: rule.children.filter((child) => child.background) })] : []),
  ]);
  return JSON.stringify([feature.name, feature.description, names(feature.tags), feature.language, parts]);
}

/** The scenarios and the frame of a file; a file that does not exist has none. */
function read(text: string | undefined): Reading {
  const empty: Reading = { scenarios: new Map(), all: [], frame: "", whole: false };
  const parsed = text === undefined ? { feature: undefined } : parseFeature(text);
  if (PARSE_ERROR in parsed) return { ...empty, whole: true };
  if (parsed.feature === undefined) return empty;
  const all = scenariosOf(parsed.feature);
  const scenarios = new Map(all);
  return { scenarios, all, frame: frameOf(parsed.feature), whole: scenarios.size !== all.length };
}

/** Whether any scenario of the reading is approved. */
function anyApproved(reading: Reading, isApproved: IsApproved): boolean {
  return reading.all.some(([name, { tags }]) => isApproved(name, tags));
}

const sameTags = (a: string[], b: string[]): boolean => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** The scenarios, in the order of the file, that the change breaks: added with an approved tag, removed or changed while approved. */
function brokenScenarios(base: Reading, now: Reading, isApproved: IsApproved): string[] {
  const names = new Set([...base.scenarios.keys(), ...now.scenarios.keys()]);
  return [...names].filter((name) => {
    const before = base.scenarios.get(name);
    const after = now.scenarios.get(name);
    if (before !== undefined && after !== undefined && before.text === after.text && sameTags(before.tags, after.tags)) return false;
    return (before !== undefined && isApproved(name, before.tags)) || (after !== undefined && isApproved(name, after.tags));
  });
}

/**
 * What a change to a feature file breaks (ADR-040): the names of the scenarios that were approved and changed, were removed or were added with
 * an approved tag, and `OUTSIDE_SCENARIOS` when what belongs to no scenario changed in a file that has an approved scenario at the base or now.
 * A file judged as a whole gives `WHOLE_FILE` when any of its scenarios is approved. `undefined` text is a file that does not exist.
 */
export function frozenParts(base: string | undefined, now: string | undefined, isApproved: IsApproved): string[] {
  const before = read(base);
  const after = read(now);
  if (before.whole || after.whole) return anyApproved(before, isApproved) || anyApproved(after, isApproved) ? [WHOLE_FILE] : [];
  const scenarios = brokenScenarios(before, after, isApproved);
  const outside = before.frame !== after.frame && (anyApproved(before, isApproved) || anyApproved(after, isApproved));
  return outside ? [...scenarios, OUTSIDE_SCENARIOS] : scenarios;
}

/** A scenario of a feature file as the comparisons see it: its name, its text without positions and ids, and its effective tags. */
export interface ScenarioText {
  name: string;
  text: string;
  tags: string[];
}

/** Every scenario of a feature file, in the order of the file, with its normalised text and effective tags; none when the file cannot be parsed. */
export function scenarioTexts(text: string): ScenarioText[] {
  return read(text).all.map(([name, part]) => ({ name, ...part }));
}
