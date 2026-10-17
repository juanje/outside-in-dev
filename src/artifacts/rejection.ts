import { NEWLINE } from "./lines.js";

declare const BRAND: unique symbol;

/** The three parts of a rejection: what failed, the evidence (the failing assertion, the undefined step, the file) and the next action. */
export type RejectionParts = { failed: string; evidence: string; next: string };

/** A rejection. Only `rejection()` makes one, so a rejection cannot be written by hand and none can leave a part out. */
export type Rejection = Readonly<RejectionParts> & { readonly [BRAND]: true };

const PART_NAMES = Object.keys({ failed: true, evidence: true, next: true } satisfies Record<keyof RejectionParts, true>);

/** Whether a value is a rejection: an object that holds the three parts. */
export function isRejection(value: unknown): value is Rejection {
  return typeof value === "object" && value !== null && PART_NAMES.every((name) => name in value);
}

const EVIDENCE_HEADING = "Evidence:";
const NEXT_LABEL = "Next:";
const INDENT = "  ";

/** Makes a rejection from its three parts; a part that is empty is refused, so that no rejection leaves the reader without the next action. */
export function rejection(parts: RejectionParts): Rejection {
  for (const [name, text] of Object.entries(parts)) {
    if (text.trim() === "") throw new Error(`a rejection needs its ${name}: it is empty`);
  }
  return parts as Rejection;
}

/** The rejection with whose it is put before what failed, as `<label>: <failed>`. */
export function labelled(label: string, parts: RejectionParts): Rejection {
  return rejection({ ...parts, failed: `${label}: ${parts.failed}` });
}

const CUT_MARK = "…";

/** A rendered rejection of at most `limit` characters: its evidence is cut, with a mark, and its first line and its next action stay whole. A text that holds no next action is cut at the limit. */
export function boundRendered(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const lines = text.split(NEWLINE);
  const nextAt = lines.findIndex((line) => line.startsWith(NEXT_LABEL));
  if (nextAt < 0) return `${text.slice(0, limit)}${CUT_MARK}`;
  const head = lines.slice(0, nextAt).join(NEWLINE);
  const next = lines.slice(nextAt).join(NEWLINE);
  const room = Math.max(lines[0]!.length, limit - next.length - CUT_MARK.length - NEWLINE.length);
  return `${head.slice(0, room)}${CUT_MARK}${NEWLINE}${next}`;
}

/** The rejection as every surface prints it: what failed on the first line, the evidence indented under its heading, then the next action. */
export function renderRejection({ failed, evidence, next }: Rejection): string {
  return [failed, EVIDENCE_HEADING, ...evidence.split(NEWLINE).map((line) => `${INDENT}${line}`), `${NEXT_LABEL} ${next}`].join(NEWLINE);
}
