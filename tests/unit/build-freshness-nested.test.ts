import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProblem } from "../../features/support/build-freshness.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("buildProblem with a nested source file", () => {
  it("names the newer source file by its path under src/", () => {
    mkdirSync(join(dir, "src", "artifacts"), { recursive: true });
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist", "cli.js"), "");
    utimesSync(join(dir, "dist", "cli.js"), 1000, 1000);
    writeFileSync(join(dir, "src", "artifacts", "symbol.ts"), "");
    expect(buildProblem(dir)).toBe("dist/cli.js is older than src/artifacts/symbol.ts: run `npm run build` first");
  });
});
