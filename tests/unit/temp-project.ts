import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach } from "vitest";

/** The temporary project of the running test; each test gets a fresh, empty one. */
export let dir: string;

/** Gives every test of the file a fresh temporary project in `dir`, and removes it afterwards. Call it once at the top of the file. */
export function useTempDir(): void {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "oid-unit-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

/** Writes `text` to `path` in the temporary project, creating the directories on the way. */
export function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** Writes `.outside-in.json` (in `folder` of the project, by default its root) with the smallest valid configuration plus `extra` (for example a `refactor` section). */
export function writeMinimalConfig(extra: Record<string, unknown> = {}, folder = ""): void {
  const config = {
    version: 1,
    stack: "typescript",
    paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" },
    commands: { bdd: "b", unit: "u", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] },
    ...extra,
  };
  write(join(folder, ".outside-in.json"), JSON.stringify(config));
}

/** Writes `progress.json` the way `oid progress` does: two-space JSON and a trailing newline. */
export function writeProgressFile(progress: unknown): void {
  write("progress.json", `${JSON.stringify(progress, null, 2)}\n`);
}

/** Per-test limit for a test that runs real child processes (git, node runners, jscpd, knip, `oid` itself): 2 to 6 s while the BDD suite loads the machine, against vitest's 5 s default. Nothing in such a test waits on a condition, so the limit only has to be far above the slowest honest run. */
export const REAL_PROCESS_TIMEOUT_MS = 60_000;
