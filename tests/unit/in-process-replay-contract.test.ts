import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { inProcessRunners } from "../../features/support/in-process-runners.js";
import { clearReport, REAL_RUNNERS } from "../../src/artifacts/verify-runner.js";
import { REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

// The replay scripts and the in-process runners of features/support answer from the same replay files with the same code
// (`replayCall` of replay-lib.mjs): the same request gives the same exit code, the same refusal, the same report, the same
// position and the same log, whichever way it is asked.
const SUPPORT = resolve(dirname(fileURLToPath(import.meta.url)), "../../features/support");
const EXIT_CODES = { green: 0, red: 1 };
const SUITE = "suite";
const LOCATIONS = ["features/FR-CART-01.feature:3", "features/FR-CART-02.feature:3"];
const OTHER = ["features/FR-CART-03.feature:3"];
const BDD_REPORT = ".outside-in/verify/bdd.ndjson";
const UNIT_REPORT = ".outside-in/verify/unit.json";

type Entry = { recording: string | null; expect?: unknown; repeat?: true };
/** What a call came to, as far as its caller can tell, and what it left in the project. */
type Outcome = { exitCode: number | null; stderr: string; output: string | undefined; log: string | undefined; count: string | undefined };

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const read = (dir: string, name: string): string | undefined => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : undefined);

/** A project with a replay file holding `sequence` and the recordings, and the replay script and its library next to it. */
function project(script: string, file: string, sequence: Entry[]): string {
  const dir = mkdtempSync(join(tmpdir(), "oid-replay-"));
  dirs.push(dir);
  mkdirSync(join(dir, "replay"));
  copyFileSync(join(SUPPORT, "replay-lib.mjs"), join(dir, "replay-lib.mjs"));
  copyFileSync(join(SUPPORT, script), join(dir, "run.mjs"));
  writeFileSync(join(dir, "replay", file), JSON.stringify({ sequence, exitCodes: EXIT_CODES }));
  writeFileSync(join(dir, "replay", "green.json"), '{"testResults":[]}');
  writeFileSync(join(dir, "replay", "green.ndjson"), "{}\n");
  writeFileSync(join(dir, "replay", "red.json"), '{"testResults":[]}');
  writeFileSync(join(dir, "replay", "red.ndjson"), '{"red":true}\n');
  writeFileSync(join(dir, "replay", "red.txt"), "src/cart.ts(1,1): error TS2322\n");
  return dir;
}

function seen(dir: string, exitCode: number | null, stderr: string, report?: string): Outcome {
  return { exitCode, stderr, output: report === undefined ? undefined : read(dir, report), log: read(dir, ".outside-in/replay-calls.ndjson"), count: read(dir, ".outside-in/replay-bdd.count") ?? read(dir, ".outside-in/replay-unit.count") ?? read(dir, ".outside-in/replay-typecheck.count") };
}

/** The BDD command of oid for these locations, run through the replay script. */
function scriptBdd(dir: string, locations: string[]): Outcome {
  clearReport(dir, BDD_REPORT);
  const { status, stderr } = spawnSync(process.execPath, ["run.mjs", ...locations, "--format", `message:${BDD_REPORT}`], { cwd: dir, encoding: "utf8" });
  return seen(dir, status, stderr, BDD_REPORT);
}

/** The same call through the in-process runner. */
function inProcessBdd(dir: string, locations: string[]): Outcome {
  const { exitCode, stderr } = inProcessRunners({ bdd: true, unit: false, typecheck: false }).bddScenarios(dir, "ignored", locations.map((location) => ({ file: location.split(":")[0]!, line: Number(location.split(":")[1]) })));
  return seen(dir, exitCode, stderr, BDD_REPORT);
}

/** Asks `calls` of the BDD replay both ways, in two copies of the same project, and requires every call to come to the same. */
function sameBdd(sequence: Entry[], calls: string[][]): Outcome[] {
  const [byScript, byRunner] = [project("replay-bdd.mjs", "replay.json", sequence), project("replay-bdd.mjs", "replay.json", sequence)];
  const outcomes = calls.map((locations) => {
    const expected = scriptBdd(byScript, locations);
    expect(inProcessBdd(byRunner, locations)).toEqual(expected);
    return expected;
  });
  return outcomes;
}

describe("the in-process BDD replay answers as the script does", () => {
  it("follows a sequence, whole suite and scenarios in any order", () => {
    const outcomes = sameBdd([{ recording: "green", expect: SUITE }, { recording: "red", expect: { locations: LOCATIONS } }], [[], [...LOCATIONS].reverse()]);
    expect(outcomes.map(({ exitCode }) => exitCode)).toEqual([0, 1]);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("moves on from an entry with repeat to the entry after it (the `after` fallback)", () => {
    const outcomes = sameBdd([{ recording: "green", expect: SUITE, repeat: true }, { recording: "red", expect: { locations: LOCATIONS } }], [[], [], LOCATIONS, []]);
    expect(outcomes.map(({ exitCode }) => exitCode)).toEqual([0, 0, 1, 2]);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers every later identical call from an entry with repeat", () => {
    const outcomes = sameBdd([{ recording: "red", expect: SUITE, repeat: true }], [[], [], []]);
    expect(outcomes.map(({ exitCode }) => exitCode)).toEqual([1, 1, 1]);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses an unexpected request, saying what was expected and what came, and logs it", () => {
    const [refused] = sameBdd([{ recording: "green", expect: { locations: LOCATIONS } }], [OTHER]);
    expect(refused?.exitCode).toBe(2);
    expect(refused?.stderr).toContain("FR-CART-03");
    expect(refused?.stderr).toContain("FR-CART-02");
    expect(refused?.output).toBeUndefined();
    expect(refused?.log).toContain('"error"');
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses a call when the sequence is exhausted", () => {
    const outcomes = sameBdd([{ recording: "green", expect: SUITE }], [[], []]);
    expect(outcomes[1]?.exitCode).toBe(2);
    expect(outcomes[1]?.stderr).toContain("exhausted");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("clears the report of an earlier run before it answers", () => {
    const dir = project("replay-bdd.mjs", "replay.json", [{ recording: "green", expect: SUITE }]);
    mkdirSync(join(dir, ".outside-in/verify"), { recursive: true });
    writeFileSync(join(dir, BDD_REPORT), "stale\n");
    expect(inProcessBdd(dir, []).output).toBe("{}\n");
    expect(inProcessBdd(dir, []).output).toBeUndefined();
  });
});

describe("the in-process unit and type check replays answer as the scripts do", () => {
  it("answers the unit suite in order and refuses when the sequence is exhausted", () => {
    const sequence: Entry[] = [{ recording: "green", expect: SUITE }, { recording: "red", expect: SUITE }];
    const [byScript, byRunner] = [project("replay-unit.mjs", "unit.json", sequence), project("replay-unit.mjs", "unit.json", sequence)];
    const runners = inProcessRunners({ bdd: false, unit: true, typecheck: false });
    for (const expectedExit of [0, 1, 2]) {
      clearReport(byScript, UNIT_REPORT);
      const { status, stderr } = spawnSync(process.execPath, ["run.mjs", "--reporter=json", `--outputFile=${UNIT_REPORT}`], { cwd: byScript, encoding: "utf8" });
      const { exitCode } = runners.unitSuite(byRunner, "ignored");
      expect(exitCode).toBe(expectedExit);
      expect(seen(byRunner, exitCode, "", UNIT_REPORT)).toEqual(seen(byScript, status, "", UNIT_REPORT));
      if (expectedExit === 2) expect(stderr).toContain("exhausted");
    }
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers the type check by position, a clean check first, with the recorded output", () => {
    const sequence: Entry[] = [{ recording: null }, { recording: "red" }];
    const [byScript, byRunner] = [project("replay-typecheck.mjs", "typecheck.json", sequence), project("replay-typecheck.mjs", "typecheck.json", sequence)];
    const runners = inProcessRunners({ bdd: false, unit: false, typecheck: true });
    for (const expected of [{ exitCode: 0, output: "" }, { exitCode: 1, output: "src/cart.ts(1,1): error TS2322\n" }, { exitCode: 2, output: "" }]) {
      const { status, stdout } = spawnSync(process.execPath, ["run.mjs", "--pretty", "false"], { cwd: byScript, encoding: "utf8" });
      const answer = runners.typecheck(byRunner, "ignored");
      expect(answer).toEqual(expected);
      expect({ status, stdout }).toEqual({ status: expected.exitCode, stdout: expected.output });
      expect(read(byRunner, ".outside-in/replay-calls.ndjson")).toBe(read(byScript, ".outside-in/replay-calls.ndjson"));
    }
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers one unit test and one scenario for oid try as the scripts do, with the report in a directory of its own and nothing made in the project", () => {
    const bdd: Entry[] = [{ recording: "green", expect: { locations: [LOCATIONS[0]!] } }];
    const unit: Entry[] = [{ recording: "red", expect: { file: "tests/unit/a.test.ts", name: "adds up" } }];
    const [byScript, byRunner] = [project("replay-bdd.mjs", "replay.json", bdd), project("replay-bdd.mjs", "replay.json", bdd)];
    const report = join(byScript, "elsewhere.ndjson");
    const { status, stderr } = spawnSync(process.execPath, ["run.mjs", LOCATIONS[0]!, "--dry-run", "--format", `message:${report}`], { cwd: byScript, encoding: "utf8" });
    const answered = inProcessRunners({ bdd: true, unit: false, typecheck: false }).tryBddScenario(byRunner, "ignored", { file: "features/FR-CART-01.feature", line: 3 }, true);
    expect(answered).toEqual({ exitCode: status, report: readFileSync(report, "utf8"), stderr });
    expect(existsSync(join(byRunner, ".outside-in/verify"))).toBe(false);
    const [unitScript, unitRunner] = [project("replay-unit.mjs", "unit.json", unit), project("replay-unit.mjs", "unit.json", unit)];
    const unitReport = join(unitScript, "elsewhere.json");
    const unitRun = spawnSync(process.execPath, ["run.mjs", "tests/unit/a.test.ts", "--testNamePattern=adds up", "--reporter=json", `--outputFile=${unitReport}`], { cwd: unitScript, encoding: "utf8" });
    const unitAnswered = inProcessRunners({ bdd: false, unit: true, typecheck: false }).tryUnitTest(unitRunner, "ignored", { file: "tests/unit/a.test.ts", name: "adds up" });
    expect(unitAnswered).toEqual({ exitCode: unitRun.status, report: JSON.parse(readFileSync(unitReport, "utf8")), stderr: unitRun.stderr });
    expect(existsSync(join(unitRunner, ".outside-in/verify"))).toBe(false);
    expect(read(unitRunner, ".outside-in/replay-calls.ndjson")).toBe(read(unitScript, ".outside-in/replay-calls.ndjson"));
  }, REAL_PROCESS_TIMEOUT_MS);

  it("leaves the other commands to the real runners", () => {
    const runners = inProcessRunners({ bdd: true, unit: true, typecheck: true });
    expect(runners.command).toBe(REAL_RUNNERS.command);
    expect(inProcessRunners({ bdd: false, unit: false, typecheck: false })).toEqual(REAL_RUNNERS);
  });
});
