// The BDD runner of the `oid run` fixtures that do not need a real cucumber: it replays a Cucumber Messages report
// that a real cucumber run wrote once, and exits with the code that run had.
//
// Called as the configured BDD command is: `node bdd-replay.mjs [file:line ...] --format message:<path>`.
// `replay/replay.json` is { "sequence": [{ "recording": "<name>", "expect": "suite" | { locations: ["file:line", ...] }, "repeat": true }, ...],
// "exitCodes": {...} } (see replay-lib.mjs): a call without locations is a run of the whole suite, a call with locations the run
// of those scenarios (as a set: their order is not contractual); the call must be the one the current entry expects.
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
// A gate recording holds exactly the scenarios the locations select; the fixture takes the locations an entry expects from it.
//
// Recordings suite-red (cucumber-js 13.3.0 on a fixture whose "Add to cart" step fails, the whole suite) and typecheck-error-in-test
// (the typescript of this repository, a tsconfig including tests/ and a test file with `const count: number = "one"`) were made the same way;
// <root> stands for the directory they were recorded in. A recording may hold <root> in place of the directory it was recorded in
// (the recorder of features/run-04.feature does); it is replaced by the directory this script runs in, so that the paths in
// failure messages locate the files of the project.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { answer, readReplay } from "./replay-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const replay = readReplay(here, "replay.json");
const args = process.argv.slice(2);
const output = args[args.indexOf("--format") + 1].slice("message:".length);
const locations = args.filter((arg) => /:\d+$/.test(arg));
const { entry } = answer("bdd", replay, locations.length === 0 ? "suite" : { locations });
const recording = join(here, "replay", `${entry.recording}.ndjson`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, readFileSync(recording, "utf8").split("<root>").join(process.cwd()));
process.exit(replay.exitCodes[entry.recording]);
