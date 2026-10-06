import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProblem } from "../../features/support/build-freshness.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "oid-unit-"));
  mkdirSync(join(root, "src", "commands"), { recursive: true });
  mkdirSync(join(root, "dist"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function touch(rel: string, seconds: number): void {
  writeFileSync(join(root, rel), "");
  utimesSync(join(root, rel), seconds, seconds);
}

describe("buildProblem", () => {
  it("asks for a build when dist/cli.js does not exist", () => {
    touch("src/cli.ts", 100);
    expect(buildProblem(root)).toMatch(/npm run build/);
  });

  it("asks for a build when a source file is newer than dist/cli.js", () => {
    touch("dist/cli.js", 100);
    touch("src/cli.ts", 100);
    touch("src/commands/check.ts", 200);
    expect(buildProblem(root)).toMatch(/npm run build/);
  });

  it("accepts a build that is not older than any source file", () => {
    touch("src/cli.ts", 100);
    touch("src/commands/check.ts", 200);
    touch("dist/cli.js", 200);
    expect(buildProblem(root)).toBeNull();
  });
});
