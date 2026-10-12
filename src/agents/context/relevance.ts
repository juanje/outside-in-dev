/** What separates the words of a list written as one text. */
const WHITESPACE = /\s+/;

/** The keywords of Gherkin. */
const GHERKIN_KEYWORDS = "feature scenario given background outline examples example rule".split(WHITESPACE);

/** Words that tell nothing about what a text is about, and the keywords of Gherkin. */
const IGNORED_WORDS = new Set([
  ...["the", "and", "but", "for", "with", "without", "that", "this", "these", "those", "from", "into", "onto", "its", "his", "her", "their", "was", "are", "were", "been", "being", "has", "have", "had", "can", "could", "may", "might", "must", "shall", "should", "will", "would", "not", "nor", "any", "all", "each", "every", "some", "than", "then", "when", "whenever", "where", "which", "who", "whose", "what", "how", "why", "while", "after", "before", "also", "only", "own", "same", "such", "too", "very", "does", "did", "done", "via", "per", "one", "two", "else"],
  ...GHERKIN_KEYWORDS,
]);

/** The shortest word that counts as a term. */
const MIN_WORD_LENGTH = 3;

/** The shortest word that remains after the ending of a word is taken off. */
const MIN_STEM_LENGTH = 3;

const WORD_SEPARATOR = /[^a-z0-9]+/;
const ENDINGS = "ing ed es s".split(WHITESPACE);

/** The word without its ending (`fails` and `failed` give `fail`), so that two forms of a word count as one. */
function stemOf(word: string): string {
  const ending = ENDINGS.find((suffix) => word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH);
  return ending === undefined ? word : word.slice(0, -ending.length);
}

/** The distinct terms of a text: its lowercase words, without the words that tell nothing and without their endings; a name such as `notify_command` gives its parts. */
export function termsOf(text: string): Set<string> {
  const words = text.toLowerCase().split(WORD_SEPARATOR);
  return new Set(words.filter((word) => word.length >= MIN_WORD_LENGTH && !IGNORED_WORDS.has(word)).map(stemOf));
}

/** How distinctive each term is among some texts: the less of them hold a term, the more it weighs. A term that none holds is left out. */
export function termWeights(documents: Set<string>[]): Map<string, number> {
  const holders = new Map<string, number>();
  for (const terms of documents) for (const term of terms) holders.set(term, (holders.get(term) ?? 0) + 1);
  return new Map([...holders].map(([term, count]) => [term, Math.log(1 + documents.length / count)]));
}

/** The weights of the terms that a text shares with a query, added up; the query gives each term its own weight. */
export function overlap(terms: Set<string>, query: Map<string, number>, weights: Map<string, number>): number {
  return [...terms].reduce((sum, term) => sum + (query.get(term) ?? 0) * (weights.get(term) ?? 0), 0);
}
