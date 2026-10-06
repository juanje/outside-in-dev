import { relative } from "node:path";
import { CATEGORY, type FindingDraft } from "./findings.js";

interface ClonePart {
  name: string;
  start: number;
  end: number;
}

type Location = NonNullable<FindingDraft["related"]>[number];

interface Clone {
  firstFile: ClonePart;
  secondFile: ClonePart;
  lines: number;
}

function locate(root: string, { name, start, end }: ClonePart): Location {
  return { file: relative(root, name), range: { start, end } };
}

function compareLocations(a: Location, b: Location): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : a.range.start - b.range.start;
}

/** The findings of the clones in the JSON report of jscpd, with the paths relative to `root`; the part that comes first by file and line is the finding's own. */
export function duplicationFindings(report: unknown, root: string): FindingDraft[] {
  const { duplicates } = report as { duplicates: Clone[] };
  return duplicates.map(({ firstFile, secondFile, lines }) => {
    const [own, other] = [locate(root, firstFile), locate(root, secondFile)].sort(compareLocations);
    return { category: CATEGORY.duplication, ...own!, detail: `${lines} duplicated lines`, related: [other!] };
  });
}
