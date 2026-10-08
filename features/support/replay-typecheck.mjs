// The type check of the `oid run` fixtures that do not need a real tsc: prints what a real `tsc --noEmit --pretty false`
// printed once, and exits with its code. `replay/typecheck.json` is { "recording": "<name>" | null, "exitCodes": {...} };
// no recording is a clean check. "recording" may also be a list: the n-th call of a run replays the n-th entry (null for a
// clean check; the position is kept in .outside-in/replay-typecheck.count, which git ignores). The recording, features/support/recorded/<name>.txt, was made with the typescript of this
// repository on a project holding features/support/cart-files.ts CART_CODE.withTypeError; <root> stands for its directory.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const replay = JSON.parse(readFileSync(join(here, "replay", "typecheck.json"), "utf8"));
const COUNT_FILE = join(".outside-in", "replay-typecheck.count");
function recording() {
  if (!Array.isArray(replay.recording)) return replay.recording;
  const position = existsSync(COUNT_FILE) ? Number(readFileSync(COUNT_FILE, "utf8")) : 0;
  mkdirSync(dirname(COUNT_FILE), { recursive: true });
  writeFileSync(COUNT_FILE, String(position + 1));
  return replay.recording[position] ?? null;
}
const name = recording();
if (name !== null) process.stdout.write(readFileSync(join(here, "replay", `${name}.txt`), "utf8").split("<root>").join(process.cwd()));
process.exit(name === null ? 0 : replay.exitCodes[name]);
