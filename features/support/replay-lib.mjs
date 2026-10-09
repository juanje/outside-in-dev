// What the three replay scripts (replay-unit.mjs, replay-bdd.mjs, replay-typecheck.mjs) share: the sequence of entries a
// fixture declares, the check that a call is the one the current entry expects, and the log of the calls.
//
// A replay file holds { "sequence": [entry, ...], "exitCodes": {...} }. An entry is { "recording": "<name>" | null,
// "expect": <the request it answers>, "repeat": true }. `expect` is "suite" (the whole suite), { file, name } (one unit test),
// { locations: ["file:line", ...] } (some scenarios; the order is not contractual) or absent (any call, as the type check).
// An entry is consumed by the call it answers; only an entry with `repeat: true` answers every later identical call too.
// A call that is not the one the current entry expects, or that arrives when the sequence is exhausted, is refused: exit code 2
// and what was expected and what was received on stderr. `replayCall` is the whole of a call; the scripts (as a process) and the in-process
// replayer of features/support/in-process-runners.ts (as a function) both run it, so that they cannot differ.
//
// Every call, answered or refused, is appended to .outside-in/replay-calls.ndjson (in the directory the script runs in,
// which git ignores): the request and the entry that answered it. The position in the sequence is kept in
// .outside-in/replay-<kind>.count.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CALL_LOG = join(".outside-in", "replay-calls.ndjson");
const REFUSED = 2;

/** The location `file:line` without a leading `./`. */
const normalised = (location) => location.replace(/^\.\//, "");

/** A request or an expectation in the one form that is compared: the locations normalised and sorted, the suite as { suite: true }. */
export function canonical(request) {
  if (request === undefined || request === null) return {};
  if (request === "suite") return { suite: true };
  if (request.locations !== undefined) return { locations: request.locations.map(normalised).sort() };
  if (request.file !== undefined || request.name !== undefined) return { file: request.file, name: request.name };
  return request;
}

/** The test name that `--testNamePattern=` carries, with the escaping of a regular expression taken off. */
export function unescapedName(pattern) {
  return pattern.replace(/\\(.)/g, "$1");
}

/** A call no entry answers: carries the message that is printed and the log line already written. */
export class ReplayRefused extends Error {}

function refuse(cwd, kind, position, expected, received, why) {
  const message = `replay ${kind}: call ${position + 1} ${why}; expected ${expected === undefined ? "no further call" : JSON.stringify(expected)}, received ${JSON.stringify(received)}`;
  mkdirSync(dirname(join(cwd, CALL_LOG)), { recursive: true });
  appendFileSync(join(cwd, CALL_LOG), `${JSON.stringify({ kind, call: position + 1, request: received, expected, error: message })}\n`);
  throw new ReplayRefused(message);
}

/** Finds the entry that answers `request` and moves the position on (the state and the log are kept under `cwd`); throws ReplayRefused if no entry does. Returns { entry, index }. */
export function answer(kind, replay, request, cwd) {
  const countFile = join(cwd, ".outside-in", `replay-${kind}.count`);
  const state = existsSync(countFile) ? JSON.parse(readFileSync(countFile, "utf8")) : { position: 0, calls: 0 };
  const received = canonical(request);
  let { position } = state;
  const matching = (entry) => JSON.stringify(canonical(entry.expect)) === JSON.stringify(received);
  const first = replay.sequence[position];
  if (first === undefined) refuse(cwd, kind, state.calls, undefined, received, "arrives with the sequence exhausted");
  // A repeating entry that does not match yields to the entry after it, which is the first the call can still be.
  while (replay.sequence[position].repeat === true && !matching(replay.sequence[position]) && replay.sequence[position + 1] !== undefined) position += 1;
  const entry = replay.sequence[position];
  if (!matching(entry)) refuse(cwd, kind, state.calls, canonical(entry.expect), received, `is not the one entry ${position + 1} answers`);
  mkdirSync(dirname(countFile), { recursive: true });
  writeFileSync(countFile, JSON.stringify({ position: entry.repeat === true ? position : position + 1, calls: state.calls + 1 }));
  appendFileSync(join(cwd, CALL_LOG), `${JSON.stringify({ kind, call: state.calls + 1, request: received, entry: position, recording: entry.recording, repeat: entry.repeat === true })}\n`);
  return { entry, index: position };
}

/** What each kind of replay reads and writes: its replay file, the extension of its recordings and whether the recording goes to a report file (else to stdout). */
const KINDS = { unit: { file: "unit.json", extension: "json", toFile: true }, bdd: { file: "replay.json", extension: "ndjson", toFile: true }, typecheck: { file: "typecheck.json", extension: "txt", toFile: false } };

/**
 * One call of a replay, the whole behaviour of the three scripts: `here` holds `replay/` (the replay file and the recordings), `cwd` is the
 * directory the call runs in (the position, the log and `<root>` refer to it) and `request` is what the call asks for ("suite", { file, name },
 * { locations } or undefined). Writes the recording to `output` (relative to `cwd`) or returns it as `stdout`; a call no entry answers returns
 * the refusal on `stderr` with exit code 2. Returns { exitCode, stdout, stderr }.
 */
export function replayCall(kind, { here, cwd, request, output }) {
  const { file, extension, toFile } = KINDS[kind];
  const replay = JSON.parse(readFileSync(join(here, "replay", file), "utf8"));
  let entry;
  try {
    ({ entry } = answer(kind, replay, request, cwd));
  } catch (error) {
    if (!(error instanceof ReplayRefused)) throw error;
    return { exitCode: REFUSED, stdout: "", stderr: `${error.message}\n` };
  }
  const text = entry.recording === null ? "" : readFileSync(join(here, "replay", `${entry.recording}.${extension}`), "utf8").split("<root>").join(cwd);
  if (toFile) {
    mkdirSync(dirname(resolve(cwd, output)), { recursive: true });
    writeFileSync(resolve(cwd, output), text);
  }
  return { exitCode: entry.recording === null ? 0 : (replay.exitCodes[entry.recording] ?? 0), stdout: toFile ? "" : text, stderr: "" };
}

/** Prints what a call returned and ends the process with its exit code: what a replay script does after `replayCall`. */
export function finish({ exitCode, stdout, stderr }) {
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exit(exitCode);
}
