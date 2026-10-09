import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dir, REAL_PROCESS_TIMEOUT_MS, useTempDir, write } from "./temp-project.js";

const SUPPORT = resolve(dirname(fileURLToPath(import.meta.url)), "../../features/support");
const EXIT_CODES = { green: 0, red: 1 };
const REFUSED = 2;
useTempDir();

type Entry = { recording: string | null; expect?: unknown; repeat?: true };

/** Puts a replay script, its library and a replay file with `sequence` in the temporary directory, then runs the script there with `args`. */
function call(script: "unit" | "bdd" | "typecheck", sequence: Entry[], args: string[]): { status: number | null; stderr: string } {
  copyFileSync(join(SUPPORT, "replay-lib.mjs"), join(dir, "replay-lib.mjs"));
  copyFileSync(join(SUPPORT, `replay-${script}.mjs`), join(dir, "run.mjs"));
  const file = { unit: "unit.json", bdd: "replay.json", typecheck: "typecheck.json" }[script];
  write(`replay/${file}`, JSON.stringify({ sequence, exitCodes: EXIT_CODES }));
  write("replay/green.json", '{"testResults":[]}');
  write("replay/green.ndjson", "{}\n");
  write("replay/red.txt", "src/cart.ts(1,1): error TS2322\n");
  const { status, stderr } = spawnSync(process.execPath, ["run.mjs", ...args], { cwd: dir, encoding: "utf8" });
  return { status, stderr };
}

/** The calls the scripts logged in the temporary directory, one object each. */
function logged(): { kind: string; call: number; request: unknown; entry?: number; recording?: string; error?: string }[] {
  return readFileSync(join(dir, ".outside-in", "replay-calls.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

/** Calls the same script again in the same directory, as a run does; the replay file stays. */
function again(args: string[]): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync(process.execPath, ["run.mjs", ...args], { cwd: dir, encoding: "utf8" });
  return { status, stderr };
}

const TEST = { file: "tests/unit/cart.test.ts", name: "cart lines > adds a line (1+1)" };
const TEST_ARGS = ["tests/unit/cart.test.ts", "--testNamePattern=cart lines > adds a line \\(1\\+1\\)", "--reporter=json", "--outputFile=out/report.json"];
const SUITE_ARGS = ["--reporter=json", "--outputFile=out/report.json"];

describe("the unit replay", () => {
  it("answers the whole suite when the entry expects it, and writes the report", () => {
    expect(call("unit", [{ recording: "green", expect: "suite" }], SUITE_ARGS).status).toBe(0);
    expect(existsSync(join(dir, "out/report.json"))).toBe(true);
    expect(logged()).toEqual([{ kind: "unit", call: 1, request: { suite: true }, entry: 0, recording: "green", repeat: false }]);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers the one test the entry names, whatever escaping oid applies to its name", () => {
    expect(call("unit", [{ recording: "red", expect: TEST }], TEST_ARGS).status).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses the whole suite when the entry expects one test, and says both", () => {
    const { status, stderr } = call("unit", [{ recording: "green", expect: TEST }], SUITE_ARGS);
    expect(status).toBe(REFUSED);
    expect(stderr).toContain(JSON.stringify(TEST));
    expect(stderr).toContain('{"suite":true}');
    expect(logged()[0]?.error).toBe(stderr.trim());
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses a test in another file", () => {
    const args = ["tests/unit/other.test.ts", ...TEST_ARGS.slice(1)];
    expect(call("unit", [{ recording: "green", expect: TEST }], args).status).toBe(REFUSED);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses another test name, and a run that names no test", () => {
    const args = [TEST_ARGS[0]!, "--testNamePattern=cart lines > adds a line", ...TEST_ARGS.slice(2)];
    expect(call("unit", [{ recording: "green", expect: TEST }], args).status).toBe(REFUSED);
    expect(call("unit", [{ recording: "green", expect: TEST }], [TEST_ARGS[0]!, ...TEST_ARGS.slice(2)]).status).toBe(REFUSED);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses a call when the sequence is exhausted", () => {
    expect(call("unit", [{ recording: "green", expect: "suite" }], SUITE_ARGS).status).toBe(0);
    const { status, stderr } = again(SUITE_ARGS);
    expect(status).toBe(REFUSED);
    expect(stderr).toContain("exhausted");
    expect(logged()[1]?.error).toBeDefined();
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers every later identical call from an entry with repeat, and refuses a different one", () => {
    expect(call("unit", [{ recording: "green", expect: "suite", repeat: true }], SUITE_ARGS).status).toBe(0);
    expect(again(SUITE_ARGS).status).toBe(0);
    expect(again(SUITE_ARGS).status).toBe(0);
    expect(logged().map((entry) => entry.entry)).toEqual([0, 0, 0]);
    expect(again(TEST_ARGS).status).toBe(REFUSED);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("consumes an entry without repeat once", () => {
    const sequence: Entry[] = [{ recording: "green", expect: "suite" }, { recording: "red", expect: "suite" }];
    expect(call("unit", sequence, SUITE_ARGS).status).toBe(0);
    expect(again(SUITE_ARGS).status).toBe(1);
    expect(again(SUITE_ARGS).status).toBe(REFUSED);
  }, REAL_PROCESS_TIMEOUT_MS);
});

const LOCATIONS = ["features/FR-CART-01.feature:3", "features/FR-CART-02.feature:3"];
const bddArgs = (...locations: string[]): string[] => [...locations, "--format", "message:out/report.ndjson"];

describe("the BDD replay", () => {
  it("answers the whole suite when the entry expects it", () => {
    expect(call("bdd", [{ recording: "green", expect: "suite" }], bddArgs()).status).toBe(0);
    expect(existsSync(join(dir, "out/report.ndjson"))).toBe(true);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers the scenarios of the entry in any order", () => {
    expect(call("bdd", [{ recording: "red", expect: { locations: LOCATIONS } }], bddArgs(...[...LOCATIONS].reverse())).status).toBe(1);
    expect(logged()[0]?.request).toEqual({ locations: LOCATIONS });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses the whole suite when the entry expects scenarios, and the scenarios when it expects the suite", () => {
    expect(call("bdd", [{ recording: "green", expect: { locations: LOCATIONS } }], bddArgs()).status).toBe(REFUSED);
    expect(call("bdd", [{ recording: "green", expect: "suite" }], bddArgs(...LOCATIONS)).status).toBe(REFUSED);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses a scenario in another file", () => {
    const { status, stderr } = call("bdd", [{ recording: "green", expect: { locations: LOCATIONS } }], bddArgs(LOCATIONS[0]!, "features/FR-CART-03.feature:3"));
    expect(status).toBe(REFUSED);
    expect(stderr).toContain("FR-CART-03");
    expect(stderr).toContain("FR-CART-02");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses other locations of the same count, and one location more or fewer", () => {
    const sequence: Entry[] = [{ recording: "green", expect: { locations: LOCATIONS } }];
    expect(call("bdd", sequence, bddArgs(LOCATIONS[0]!, "features/FR-CART-02.feature:8")).status).toBe(REFUSED);
    expect(call("bdd", sequence, bddArgs(...LOCATIONS, "features/FR-CART-02.feature:8")).status).toBe(REFUSED);
    expect(call("bdd", sequence, bddArgs(LOCATIONS[0]!)).status).toBe(REFUSED);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses a call when the sequence is exhausted", () => {
    expect(call("bdd", [{ recording: "green", expect: "suite" }], bddArgs()).status).toBe(0);
    const { status, stderr } = again(bddArgs());
    expect(status).toBe(REFUSED);
    expect(stderr).toContain("exhausted");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers every later identical call from an entry with repeat", () => {
    expect(call("bdd", [{ recording: "green", expect: "suite", repeat: true }], bddArgs()).status).toBe(0);
    expect(again(bddArgs()).status).toBe(0);
    expect(again(bddArgs(...LOCATIONS)).status).toBe(REFUSED);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("moves on from an entry with repeat to the entry after it when the call is that one", () => {
    const sequence: Entry[] = [{ recording: "green", expect: "suite", repeat: true }, { recording: "red", expect: { locations: LOCATIONS } }];
    expect(call("bdd", sequence, bddArgs()).status).toBe(0);
    expect(again(bddArgs(...LOCATIONS)).status).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);
});

describe("the type check replay", () => {
  it("answers by position: a clean check, then a recorded error", () => {
    const sequence: Entry[] = [{ recording: null }, { recording: "red" }];
    expect(call("typecheck", sequence, ["--pretty", "false"]).status).toBe(0);
    expect(again(["--pretty", "false"]).status).toBe(1);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("refuses a call when the sequence is exhausted", () => {
    expect(call("typecheck", [{ recording: null }], []).status).toBe(0);
    const { status, stderr } = again([]);
    expect(status).toBe(REFUSED);
    expect(stderr).toContain("exhausted");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("answers every call from an entry with repeat", () => {
    expect(call("typecheck", [{ recording: null, repeat: true }], []).status).toBe(0);
    expect(again([]).status).toBe(0);
  }, REAL_PROCESS_TIMEOUT_MS);
});
