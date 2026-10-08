// The type check of the `oid run` fixtures that do not need a real tsc: prints what a real `tsc --noEmit --pretty false`
// printed once, and exits with its code. `replay/typecheck.json` is { "recording": "<name>" | null, "exitCodes": {...} };
// no recording is a clean check. The recording, features/support/recorded/<name>.txt, was made with the typescript of this
// repository on a project holding features/support/cart-files.ts CART_CODE.withTypeError; <root> stands for its directory.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const replay = JSON.parse(readFileSync(join(here, "replay", "typecheck.json"), "utf8"));
if (replay.recording !== null) process.stdout.write(readFileSync(join(here, "replay", `${replay.recording}.txt`), "utf8").split("<root>").join(process.cwd()));
process.exit(replay.recording === null ? 0 : replay.exitCodes[replay.recording]);
