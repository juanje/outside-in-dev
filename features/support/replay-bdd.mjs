// The BDD runner of the `oid run` fixtures that do not need a real cucumber: it replays a Cucumber Messages report
// that a real cucumber run wrote once, and exits with the code that run had.
//
// Called as the configured BDD command is: `node bdd-replay.mjs [file:line ...] --format message:<path>`.
// A call without locations is the baseline (the whole suite); a call with locations is the gate's run of those
// scenarios. `replay/replay.json` names the recording for each: { "baseline": "<name>", "gate": "<name>", "exitCodes": {...} }.
//
// Recordings: features/support/recorded/<name>.ndjson, with the exit codes in exit-codes.json. They were made with
// cucumber-js 13.3.0 (pinned, NFR-09) in the fixture of features/run-03.feature, once per case. Their stack traces
// keep the paths of the temporary directory they were recorded in; oid reads uris (relative), scenario and step
// names, statuses and messages, and none of them depends on those paths.
//
// To re-record after a cucumber upgrade: in `CUCUMBER_COMMANDS.bdd` (features/steps/run.steps.ts) put, for one run
// of features/run-03.feature, a wrapper script in place of the cucumber command. The wrapper runs the real
// `node_modules/.bin/cucumber-js` with the same arguments (NODE_OPTIONS="--import tsx"), copies the file after
// `--format message:` to a directory of your choice and exits with cucumber's code. Take from that directory, for
// each case, the report of the gate run (the one with locations) whose step file has the content of the case, and
// the report of a baseline run (no locations); save them under the names above and update exit-codes.json.
// A gate recording must hold exactly the scenarios the locations select; this script checks the count.
//
// Recordings suite-red (cucumber-js 13.3.0 on a fixture whose "Add to cart" step fails, the whole suite) and typecheck-error-in-test
// (the typescript of this repository, a tsconfig including tests/ and a test file with `const count: number = "one"`) were made the same way;
// <root> stands for the directory they were recorded in.
//
// `gate` may also be a list of names: the gate runs of one `oid run` then replay them in order, one for each call with
// locations (the position is kept in .outside-in/replay-bdd.count, which git ignores). A recording may hold <root> in
// place of the directory it was recorded in (the recorder of features/run-04.feature does); it is replaced by the
// directory this script runs in, so that the paths in failure messages locate the files of the project.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const replay = JSON.parse(readFileSync(join(here, "replay", "replay.json"), "utf8"));
const args = process.argv.slice(2);
const output = args[args.indexOf("--format") + 1].slice("message:".length);
const locations = args.filter((arg) => /:\d+$/.test(arg));
const COUNT_FILE = join(".outside-in", "replay-bdd.count");
function gateName() {
  if (!Array.isArray(replay.gate)) return replay.gate;
  const position = existsSync(COUNT_FILE) ? Number(readFileSync(COUNT_FILE, "utf8")) : 0;
  mkdirSync(dirname(COUNT_FILE), { recursive: true });
  writeFileSync(COUNT_FILE, String(position + 1));
  if (position >= replay.gate.length) {
    console.error(`the run made more gate calls than the ${replay.gate.length} recordings of the fixture`);
    process.exit(2);
  }
  return replay.gate[position];
}
// `baseline` may also be a list: the calls with no locations (the start of the run, then the gate's run of the whole
// suite) replay its entries in order, the last one for every call beyond the list (position in .outside-in/replay-bdd-suite.count).
const SUITE_COUNT_FILE = join(".outside-in", "replay-bdd-suite.count");
function suiteName() {
  if (!Array.isArray(replay.baseline)) return replay.baseline;
  const position = existsSync(SUITE_COUNT_FILE) ? Number(readFileSync(SUITE_COUNT_FILE, "utf8")) : 0;
  mkdirSync(dirname(SUITE_COUNT_FILE), { recursive: true });
  writeFileSync(SUITE_COUNT_FILE, String(position + 1));
  return replay.baseline[Math.min(position, replay.baseline.length - 1)];
}
const name = locations.length === 0 ? suiteName() : gateName();
const recording = join(here, "replay", `${name}.ndjson`);
const started = readFileSync(recording, "utf8").split("\n").filter((line) => line.startsWith('{"testCaseStarted"')).length;
if (locations.length > 0 && started !== locations.length) {
  console.error(`the recording ${name} ran ${started} scenarios, the call selects ${locations.length}`);
  process.exit(2);
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, readFileSync(recording, "utf8").split("<root>").join(process.cwd()));
process.exit(replay.exitCodes[name]);
