#!/usr/bin/env node
// Records the BDD replays of the `oid run` scenarios: the cucumber message reports in features/support/recorded/
// that the in-process BDD runner of the tests replays (docs/CONVENTIONS.md, docs/METHODOLOGY.md "Changing a requirement").
// Each case is a small cart project (the fixture of features/steps/run.steps.ts and the contents of
// features/support/cart-files.ts) that the real cucumber-js runs once; the report is written with the directory of the
// fixture replaced by <root>, as the committed ones.
//
//   node --import tsx scripts/record-replays.mjs record <case|all> [--out <dir>]
//       Runs the real cucumber-js on the fixture of the case and writes <case>.ndjson into features/support/recorded/
//       (and updates the case's entry in exit-codes.json there) or, with --out, into <dir> and nothing else.
//       Example: node --import tsx scripts/record-replays.mjs record bdd-clear-green --out /tmp/replays
//   node --import tsx scripts/record-replays.mjs compare <case|all> <dir> [--without <feature uri>]...
//       Compares <dir>/<case>.ndjson with the committed recording, both normalised (ids to ordinals; timestamps,
//       durations, meta and the root path removed). --without drops from the committed one the scenarios of that
//       feature file (what a change of scope excludes). Prints IDENTICAL or the first difference; exits 1 if any differs.
//       Example: node --import tsx scripts/record-replays.mjs compare all /tmp/replays
//
// Why it is a file of the repo: the Bash hook (scripts/claude-hook.mjs, ADR-055) refuses a command that writes into
// src/, tests/ or features/, and a script run with an interpreter that is not versioned (tracked by git and unchanged
// from HEAD) is read and judged like inline code. A versioned script, reviewed in its own commit, is the legal path
// for recordings that are generated. It is for the recordings of `oid run` scenarios only.
//
// Not covered (other tools or hand-made files): baseline-green and suite-red (reports of the fixture's own suite),
// try-* (oid try), the unit reports (unit-*.json, vitest), the type check outputs (*.txt) and exit-codes.json for them.
//
// The fixture knowledge lives in features/support/cart-files.ts (imported here). The files of the project around the
// scenarios (package.json, cucumber.mjs, the feature "Add to cart", its steps and src/lines.ts) are copied from
// `cucumberFiles` in features/steps/run.steps.ts: that module registers cucumber hooks when it is loaded, so a script
// cannot import it. If the two differ, the recordings change: `compare all` shows it.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RECORDED = join(ROOT, "features/support/recorded");
const EXIT_CODES = join(RECORDED, "exit-codes.json");
const { STEP_ROUNDS, CLEAR_STEP_ROUND, CLEAR_FEATURE, CART_CODE } = await import(pathToFileURL(join(ROOT, "features/support/cart-files.ts")).href);

const FIRST_SCENARIO = "features/FR-CART-02.feature:3";
const SECOND_SCENARIO = "features/FR-CART-02.feature:8";
const CLEAR_SCENARIO = "features/FR-CART-03.feature:3";
const IMPORTS = `import assert from "node:assert/strict";\nimport { Then, When } from "@cucumber/cucumber";\n`;
const stepFile = (content) => `${IMPORTS}\n${content}`;
const MISSING_CART_STEP = `When("a line is added", async function () {\n  const { addLine } = await import("../../src/cart.js");\n  addLine();\n});\n`;
const COUNT_STEP = `Then("the cart has {int} line(s)", function (count: number) {\n  assert.equal(count, 1);\n});\n`;
const EMPTY_STEP = `When("a line is added", function () {});\n`;
const THROWING_STEP = (attach) => `When("a line is added", function () {\n${attach}  throw new Error("the cart could not be built");\n});\n`;
const lines = (id, first, second) => `@${id}\nFeature: Cart lines\n  Scenario: ${first}\n    Given a cart\n    When a line is added\n    Then the cart has 1 line\n\n  Scenario: ${second}\n    Given a cart with 1 line\n    When the line is removed\n    Then the cart has 0 lines\n`;
/** The step file of the second round with the step "a line is added" throwing: code that breaks a scenario that passed. */
const BROKEN = STEP_ROUNDS[1].replace(/(When\("a line is added", async function \(\) \{\n)[^]*?(\n\}\);)/, `$1  throw new Error("the cart cannot take a line");$2`);

/**
 * The cases: the step file of the project, the cart code if there is one, the feature of FR-CART-03 if `clear`, the
 * scenarios the run asks cucumber for (`request`, in the order of the committed recording) and the form of the report:
 * `alone` is a project whose FR-CART-02 has only its first scenario and whose report has no stepDefinition messages.
 */
const CASES = {
  "missing-implementation": { steps: stepFile(`${MISSING_CART_STEP}\n${COUNT_STEP}`), request: [FIRST_SCENARIO] },
  "passes-at-once": { steps: stepFile(`${EMPTY_STEP}\nThen("the cart has {int} line(s)", function (count: number) {\n  assert.ok(count);\n});\n`), request: [FIRST_SCENARIO] },
  "undefined-step": { steps: stepFile(EMPTY_STEP), request: [FIRST_SCENARIO] },
  "not-an-assertion": { steps: stepFile(`${THROWING_STEP("")}\n${COUNT_STEP}`), request: [FIRST_SCENARIO] },
  "not-an-assertion-with-output": { alone: true, steps: stepFile(`${THROWING_STEP('  this.attach("the cart refused the line", "text/plain");\n')}\n${COUNT_STEP}`), request: [FIRST_SCENARIO] },
  "bdd-missing-implementation": { steps: STEP_ROUNDS[0], request: [FIRST_SCENARIO] },
  "bdd-remove-line-missing": { steps: STEP_ROUNDS[1], cart: CART_CODE.withCount, request: [SECOND_SCENARIO, FIRST_SCENARIO] },
  "bdd-clear-missing": { steps: CLEAR_STEP_ROUND, cart: CART_CODE.withRemove, clear: true, request: [CLEAR_SCENARIO] },
  "bdd-add-line-green": { steps: STEP_ROUNDS[0], cart: CART_CODE.withCount, request: [FIRST_SCENARIO] },
  "bdd-add-line-still-red": { steps: STEP_ROUNDS[0], cart: CART_CODE.unitOnly, request: [FIRST_SCENARIO] },
  "bdd-remove-line-green": { steps: STEP_ROUNDS[1], cart: CART_CODE.withRemove, request: [SECOND_SCENARIO] },
  "bdd-add-line-regression": { steps: BROKEN, cart: CART_CODE.withCount, request: [FIRST_SCENARIO] },
  "bdd-clear-green": { steps: CLEAR_STEP_ROUND, cart: CART_CODE.withClear, clear: true, request: [CLEAR_SCENARIO] },
  "bdd-remove-line-regression": { steps: BROKEN, cart: CART_CODE.withCount, request: [SECOND_SCENARIO, FIRST_SCENARIO] },
};

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** The fixture of a case: the project of `cucumberFiles` (run.steps.ts) and the files of the case. */
function writeFixture(root, spec) {
  write(root, "package.json", `${JSON.stringify({ name: "fixture", private: true, type: "module" })}\n`);
  write(root, "cucumber.mjs", `export default { import: ["features/steps/**/*.ts"] };\n`);
  write(root, "features/FR-CART-01.feature", `@FR-CART-01\nFeature: Cart\n  Scenario: Add to cart\n    Given a cart\n    When a product is added\n    Then the cart is not empty\n`);
  write(root, "features/steps/cart.steps.ts", `import { Given, Then, When } from "@cucumber/cucumber";\nGiven("a cart", function () {});\nWhen("a product is added", function () {});\nThen("the cart is not empty", function () {});\n`);
  write(root, "src/lines.ts", "/** Counts the lines of a cart. */\nexport function countLines(lines: string[]): number {\n  const bodyMarker = lines.length;\n  return bodyMarker;\n}\n");
  const feature = lines("FR-CART-02", "Add a line", "Remove a line");
  write(root, "features/FR-CART-02.feature", spec.alone ? `${feature.split("\n\n")[0]}\n` : feature);
  if (spec.clear) write(root, "features/FR-CART-03.feature", CLEAR_FEATURE);
  write(root, "features/steps/cart-lines.steps.ts", spec.steps);
  if (spec.cart) write(root, "src/cart.ts", spec.cart);
  symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"));
}

/** Runs the real cucumber-js on the fixture of the case; returns the report with the directory of the fixture as <root>, and the exit code. */
function runCase(name) {
  const spec = CASES[name];
  const root = realpathSync(mkdtempSync(join(tmpdir(), "oid-record-")));
  try {
    writeFixture(root, spec);
    const report = join(root, "report.ndjson");
    const run = spawnSync("node_modules/.bin/cucumber-js", [...spec.request, "--format", `message:${report}`], { cwd: root, env: { ...process.env, NODE_OPTIONS: "--import tsx" }, encoding: "utf8" });
    if (run.error !== undefined) throw run.error;
    let text = readFileSync(report, "utf8").split(root).join("<root>");
    // The committed recording of this case has no stepDefinition messages (it was trimmed to what oid reads): keep that form.
    if (spec.alone) text = text.split("\n").filter((line) => !line.startsWith('{"stepDefinition"')).join("\n");
    return { text, status: run.status };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function record(name, out) {
  const { text, status } = runCase(name);
  mkdirSync(out ?? RECORDED, { recursive: true });
  writeFileSync(join(out ?? RECORDED, `${name}.ndjson`), text);
  if (out === undefined) {
    const codes = JSON.parse(readFileSync(EXIT_CODES, "utf8"));
    codes[name] = status;
    writeFileSync(EXIT_CODES, `${JSON.stringify(codes, null, 2)}\n`);
  }
  console.log(`${name}: cucumber exit ${status}`);
}

/** Messages with the ids replaced by ordinals, and what varies between runs (time, duration, meta, paths) removed. */
function normalised(messages) {
  const ids = new Map();
  const id = (value) => (ids.has(value) ? ids.get(value) : (ids.set(value, `#${ids.size}`), ids.get(value)));
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["timestamp", "duration", "meta"].includes(key)).map(([key, item]) => [key, walk(item)]));
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(value)) return id(value);
    if (typeof value === "string") return value.replace(/\/tmp\/oid-bdd-[^/]+(\/\.oid-worktrees\/project\/[^/]+)?/g, "<root>").replace(/\/[^ \n'"]*?\/oid-record-[A-Za-z0-9]+/g, "<root>");
    return value;
  };
  return messages.map(walk);
}

/** The messages without the scenarios of the feature files `uris`: their source, document, pickles, test cases and the events of those test cases. */
function withoutFeatures(messages, uris) {
  if (uris.length === 0) return messages;
  const pickles = new Set(messages.filter((m) => m.pickle && uris.includes(m.pickle.uri)).map((m) => m.pickle.id));
  const cases = new Set(messages.filter((m) => m.testCase && pickles.has(m.testCase.pickleId)).map((m) => m.testCase.id));
  const started = new Set(messages.filter((m) => m.testCaseStarted && cases.has(m.testCaseStarted.testCaseId)).map((m) => m.testCaseStarted.id));
  return messages.filter((m) => {
    if (uris.includes(m.source?.uri) || uris.includes(m.gherkinDocument?.uri)) return false;
    if (m.pickle && pickles.has(m.pickle.id)) return false;
    if (m.testCase && cases.has(m.testCase.id)) return false;
    if (m.testCaseStarted && started.has(m.testCaseStarted.id)) return false;
    if (m.testStepStarted && started.has(m.testStepStarted.testCaseStartedId)) return false;
    if (m.testStepFinished && started.has(m.testStepFinished.testCaseStartedId)) return false;
    if (m.testCaseFinished && started.has(m.testCaseFinished.testCaseStartedId)) return false;
    return true;
  });
}

const read = (path) => readFileSync(path, "utf8").split("\n").filter((line) => line !== "").map((line) => JSON.parse(line));

/** True when the case is the same; prints IDENTICAL or the first difference. */
function compare(name, dir, without) {
  const old = normalised(withoutFeatures(read(join(RECORDED, `${name}.ndjson`)), without)).map((m) => JSON.stringify(m));
  const now = normalised(read(join(dir, `${name}.ndjson`))).map((m) => JSON.stringify(m));
  if (old.length === now.length && old.every((line, at) => line === now[at])) {
    console.log(`${name}: IDENTICAL (${now.length} messages)`);
    return true;
  }
  console.log(`${name}: DIFFERENT (committed ${old.length} messages, new ${now.length})`);
  const at = Array.from({ length: Math.max(old.length, now.length) }, (_, i) => i).find((i) => old[i] !== now[i]);
  console.log(`  first difference at message ${at}\n  committed: ${(old[at] ?? "").slice(0, 600)}\n  new:       ${(now[at] ?? "").slice(0, 600)}`);
  return false;
}

function main(args) {
  const [mode, which, ...rest] = args;
  const names = which === "all" ? Object.keys(CASES) : [which];
  const unknown = names.find((name) => CASES[name] === undefined);
  if ((mode !== "record" && mode !== "compare") || which === undefined || unknown !== undefined) {
    console.error(`usage: record-replays.mjs record <case|all> [--out <dir>] | compare <case|all> <dir> [--without <feature uri>]...\ncases: ${Object.keys(CASES).join(", ")}${unknown === undefined ? "" : `\nunknown case: ${unknown}`}`);
    return 2;
  }
  if (mode === "record") {
    const at = rest.indexOf("--out");
    const out = at === -1 ? undefined : resolve(rest[at + 1] ?? ".");
    for (const name of names) record(name, out);
    return 0;
  }
  const without = rest.flatMap((arg, at) => (rest[at - 1] === "--without" ? [arg] : []));
  const dir = resolve(rest[0] ?? ".");
  const results = names.map((name) => compare(name, dir, without));
  return results.every(Boolean) ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
