// The type check of the `oid run` fixtures that do not need a real tsc: prints what a real `tsc --noEmit --pretty false`
// printed once, and exits with its code. `replay/typecheck.json` is { "sequence": [{ "recording": "<name>" | null, "repeat": true }, ...],
// "exitCodes": {...} } (see replay-lib.mjs): the n-th call of a run is answered by the n-th entry, a null recording is a
// clean check, and the type check has no arguments to check, only its position. The recording,
// features/support/recorded/<name>.txt, was made with the typescript of this repository on a project holding
// features/support/cart-files.ts CART_CODE.withTypeError; <root> stands for its directory.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { finish, replayCall } from "./replay-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
finish(replayCall("typecheck", { here, cwd: process.cwd(), request: undefined }));
