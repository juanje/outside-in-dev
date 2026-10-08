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
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const replay = JSON.parse(readFileSync(join(here, "replay", "replay.json"), "utf8"));
const args = process.argv.slice(2);
const output = args[args.indexOf("--format") + 1].slice("message:".length);
const locations = args.filter((arg) => /:\d+$/.test(arg));
const name = locations.length === 0 ? replay.baseline : replay.gate;
const recording = join(here, "replay", `${name}.ndjson`);
const started = readFileSync(recording, "utf8").split("\n").filter((line) => line.startsWith('{"testCaseStarted"')).length;
if (locations.length > 0 && started !== locations.length) {
  console.error(`the recording ${name} ran ${started} scenarios, the call selects ${locations.length}`);
  process.exit(2);
}
mkdirSync(dirname(output), { recursive: true });
copyFileSync(recording, output);
process.exit(replay.exitCodes[name]);
