// The unit runner of the `oid run` fixtures that do not need a real vitest: it replays a vitest JSON report that a real
// vitest run wrote once, and exits with the code that run had.
//
// Called as the configured unit command is: `node unit-replay.mjs [file -t name] --reporter=json --outputFile=<path>`.
// `replay/unit.json` is { "sequence": ["<name>", ...], "exitCodes": {...} }: the n-th call of a run replays the n-th
// name (the position is kept in .outside-in/replay-unit.count, which git ignores). The first call is the baseline run.
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const replay = JSON.parse(readFileSync(join(here, "replay", "unit.json"), "utf8"));
const args = process.argv.slice(2);
const output = args.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);
const COUNT_FILE = join(".outside-in", "replay-unit.count");
const position = existsSync(COUNT_FILE) ? Number(readFileSync(COUNT_FILE, "utf8")) : 0;
mkdirSync(dirname(COUNT_FILE), { recursive: true });
writeFileSync(COUNT_FILE, String(position + 1));
if (position >= replay.sequence.length) {
  console.error(`the run made more unit calls than the ${replay.sequence.length} recordings of the fixture`);
  process.exit(2);
}
const name = replay.sequence[position];
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, readFileSync(join(here, "replay", `${name}.json`), "utf8").split("<root>").join(process.cwd()));
process.exit(replay.exitCodes[name]);
