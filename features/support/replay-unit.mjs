// The unit runner of the `oid run` fixtures that do not need a real vitest: it replays a vitest JSON report that a real
// vitest run wrote once, and exits with the code that run had.
//
// Called as the configured unit command is: `node unit-replay.mjs [<file> --testNamePattern=<escaped name>] --reporter=json --outputFile=<path>`.
// `replay/unit.json` is { "sequence": [{ "recording": "<name>", "expect": "suite" | { file, name }, "repeat": true }, ...],
// "exitCodes": {...} } (see replay-lib.mjs): the call must be the one the current entry expects, the whole suite or the one test
// (the file and the name, with the escaping oid applies to the name taken off), and is answered with the entry's recording.
//
// Recordings: features/support/recorded/<name>.json, with the exit codes in exit-codes.json. They were made with
// vitest 3.2.7 (pinned, NFR-09) in a project holding the files of features/support/cart-files.ts, once per case, with
// the directory they were recorded in replaced by <root>; this script puts the directory it runs in back, so that the
// paths in the report locate the files of the project. oid reads file names, test titles, statuses and messages.
//
// To re-record after a vitest upgrade: build a project with the files of cart-files.ts for each case (the case names say
// which: unit-red-missing is the test "adds a line" with no src/cart.ts, unit-green the same with src/cart.ts that
// has addLine and countCartLines, and so on), run `node_modules/.bin/vitest run --reporter=json --outputFile=<path>`
// in it, replace the project's directory by <root> in the file, save it under the name and update exit-codes.json.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { finish, replayCall, unescapedName } from "./replay-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const output = args.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);
const file = args.find((arg) => !arg.startsWith("--"));
const pattern = args.find((arg) => arg.startsWith("--testNamePattern="));
const request = file === undefined && pattern === undefined ? "suite" : { file, name: pattern === undefined ? undefined : unescapedName(pattern.slice("--testNamePattern=".length)) };
finish(replayCall("unit", { here, cwd: process.cwd(), request, output }));
