import { Before, Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inProcessRunners, type Replayed } from "../support/in-process-runners.js";
import { REAL_RUNNER_SCENARIOS } from "../support/real-runners.js";
import type { OidWorld } from "../support/world.js";

const SUPPORT = resolve(dirname(fileURLToPath(import.meta.url)), "../support");
const CONFIG_FILE = ".outside-in.json";
const LINT_SCRIPT = "lint.mjs";
/** The runner of a scenario that never ends: it takes the arguments oid appends and lives far longer than the limit of the scenarios. */
const HANG_SCRIPT = "hang.mjs";
const HANG_SCRIPT_TEXT = "setTimeout(() => {}, 30000);\n";
/** What the replay of a runner writes in the project to keep its position and its log: the only files of `.outside-in` that are not oid's. */
const REPLAY_BOOKKEEPING = "replay-";
const OID_DIRECTORY = ".outside-in";

/** The linter of the fixtures: it prints `problem in <file>` for each file it is given, and fails when it was given any. */
const LINT_SCRIPT_TEXT = [
  `const files = process.argv.slice(2).filter((argument) => !argument.startsWith("-"));`,
  `for (const file of files) console.log("problem in " + file);`,
  `process.exit(files.length > 0 ? 1 : 0);`,
  "",
].join("\n");

/** An entry of a replay sequence: the recording that answers, the request it answers (none for the type check), and whether it answers every later identical call. */
type Entry = { recording: string | null; expect?: unknown; repeat?: true };
/** What the runners of a scenario replay, in the order of the calls: the unit tests, the scenarios (a run or a dry run), the type check. */
type Plan = { unit?: Entry[]; bdd?: Entry[]; typecheck?: Entry[] };

const GREETING_TEST = "tests/unit/greeting.test.ts";
const GREETING_FEATURE = "features/greeting.feature";
const unitCall = (name: string) => ({ file: GREETING_TEST, name });
const scenarioCall = (line: number) => ({ locations: [`${GREETING_FEATURE}:${line}`] });
const CLEAN_TYPES: Entry[] = [{ recording: null, repeat: true }];

/** What each scenario of the feature replays; a scenario of REAL_RUNNER_SCENARIOS, or one that runs no runner, is not here. The recordings are those of features/support/recorded/try-*: made with vitest, cucumber-js and tsc on the fixture of the feature (the files of its Background), the directory they were recorded in replaced by <root> and the report trimmed to the messages oid reads. */
const PLANS: Record<string, Plan> = {
  "A unit test that fails shows its failure message without the stack": { unit: [{ recording: "try-unit-fail", expect: unitCall("greets in capitals") }], typecheck: CLEAN_TYPES },
  "A scenario that passes is tried by its location, and by its name": { bdd: [{ recording: "try-bdd-pass", expect: scenarioCall(4), repeat: true }], typecheck: CLEAN_TYPES },
  "A scenario with a step that has no definition lists it with its location and text": { bdd: [{ recording: "try-bdd-undefined", expect: scenarioCall(12) }], typecheck: CLEAN_TYPES },
  "A dry run of a scenario whose steps are all defined passes, though a step would fail": { bdd: [{ recording: "try-bdd-dry-defined", expect: scenarioCall(8) }] },
  "A type error is reported with its file and line, though the test passes": { unit: [{ recording: "try-unit-pass", expect: unitCall("greets by name") }], typecheck: [{ recording: "try-typecheck-error", repeat: true }] },
  "The linter runs only on the files changed since the last checkpoint, tracked or not, never the ignored ones": { unit: [{ recording: "try-unit-pass", expect: unitCall("greets by name") }], typecheck: CLEAN_TYPES },
  "With no file changed since the last checkpoint, the linter is skipped and says so": { unit: [{ recording: "try-unit-pass", expect: unitCall("greets by name") }], typecheck: CLEAN_TYPES },
  "Trying records nothing, and needs no feature in focus": {
    bdd: [{ recording: "try-bdd-fail", expect: scenarioCall(8) }],
    unit: [{ recording: "try-unit-fail", expect: unitCall("greets in capitals") }],
    typecheck: CLEAN_TYPES,
  },
  "Trying leaves the checkpoint, the focus and the progress of a feature in the middle of its cycle as they were": {
    bdd: [
      { recording: "try-bdd-fail", expect: scenarioCall(8) },
      { recording: "try-bdd-dry-undefined", expect: scenarioCall(12) },
    ],
    unit: [{ recording: "try-unit-fail", expect: unitCall("greets in capitals") }],
    typecheck: CLEAN_TYPES,
  },
  "A test name that matches no test is a failed verdict": { unit: [{ recording: "try-unit-none", expect: unitCall("greets nobody") }], typecheck: CLEAN_TYPES },
};

/** The scenarios of this feature that run the real vitest, tsc and cucumber. */
const REAL_SCENARIOS: readonly string[] = REAL_RUNNER_SCENARIOS["FR-VERIFY-09"];
/** The scenarios whose unit runner is the real command of the fixture, which never ends. */
const NEVER_ENDING_SCENARIO = "A command that does not end is stopped at the limit and the verdict says so";

/** The directory with the replay files and recordings of a plan: outside the project, so that the replay leaves in it only its position and its log. */
function writeReplayHome(plan: Plan): string {
  const home = mkdtempSync(join(tmpdir(), "oid-try-home-"));
  const exitCodes = JSON.parse(readFileSync(join(SUPPORT, "recorded", "exit-codes.json"), "utf8")) as Record<string, number>;
  const files: [keyof Plan, string, string][] = [
    ["bdd", "replay.json", "ndjson"],
    ["unit", "unit.json", "json"],
    ["typecheck", "typecheck.json", "txt"],
  ];
  mkdirSync(join(home, "replay"));
  for (const [kind, file, extension] of files) {
    const sequence = plan[kind];
    if (sequence === undefined) continue;
    writeFileSync(join(home, "replay", file), JSON.stringify({ sequence, exitCodes }));
    for (const recording of new Set(sequence.flatMap((entry) => (entry.recording === null ? [] : [entry.recording])))) {
      writeFileSync(join(home, "replay", `${recording}.${extension}`), readFileSync(join(SUPPORT, "recorded", `${recording}.${extension}`), "utf8"));
    }
  }
  return home;
}

Before({ tags: "@FR-VERIFY-09" }, function (this: OidWorld, { pickle }) {
  const plan = PLANS[pickle.name];
  if (plan === undefined || REAL_SCENARIOS.includes(pickle.name) || pickle.name === NEVER_ENDING_SCENARIO) return;
  const replayed: Replayed = { bdd: plan.bdd !== undefined, unit: plan.unit !== undefined, typecheck: plan.typecheck !== undefined };
  const home = writeReplayHome(plan);
  this.scratch.push(home);
  this.services = { pid: process.pid, agentDir: "", runners: inProcessRunners(replayed, home) };
});

/** The files of the project as they were when a scenario noted them. */
const noted = new WeakMap<OidWorld, Map<string, string>>();

/** Changes a command of the project's configuration. */
function setCommand(world: OidWorld, name: "unit" | "lint", command: string): void {
  const config = JSON.parse(readFileSync(world.path(CONFIG_FILE), "utf8")) as { commands: Record<string, string | null> };
  config.commands[name] = command;
  writeFileSync(world.path(CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`);
}

Given("the lint command of the project reports a problem in every file it is given", function (this: OidWorld) {
  this.write(LINT_SCRIPT, LINT_SCRIPT_TEXT);
  setCommand(this, "lint", `node ${LINT_SCRIPT}`);
});

Given("the unit command of the project never ends", function (this: OidWorld) {
  this.write(HANG_SCRIPT, HANG_SCRIPT_TEXT);
  setCommand(this, "unit", `node ${HANG_SCRIPT}`);
});

Given("the project ignores the file {string}", function (this: OidWorld, path: string) {
  appendFileSync(this.path(".gitignore"), `${path}\n`);
});

Given("the project has an untracked file {string}", function (this: OidWorld, path: string) {
  this.write(path, "notes\n");
});

/** The files of the project, leaving out what the replay of a runner keeps of its own in `.outside-in`. */
function filesOfTheProject(world: OidWorld): Map<string, string> {
  return new Map([...world.snapshotFiles()].filter(([path]) => !path.startsWith(`${OID_DIRECTORY}/${REPLAY_BOOKKEEPING}`)));
}

Given("the files of the project are noted", function (this: OidWorld) {
  noted.set(this, filesOfTheProject(this));
});

Then("the project has no {string} directory", function (this: OidWorld, name: string) {
  const path = this.path(name);
  const own = existsSync(path) ? readdirSync(path).filter((entry) => !entry.startsWith(REPLAY_BOOKKEEPING)) : [];
  assert.deepEqual(own, [], `${name} holds files that are not the replay's own`);
});

Then("no file of the project was created, changed or removed", function (this: OidWorld) {
  const before = noted.get(this);
  assert.ok(before !== undefined, "no step noted the files of the project");
  assert.deepEqual(filesOfTheProject(this), before);
});
