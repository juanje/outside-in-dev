import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runWithoutProject as run } from "./run-capture.js";

const packageJson = new URL("../../package.json", import.meta.url);
const { version } = JSON.parse(readFileSync(packageJson, "utf8")) as { version: string };

describe("oid --version", () => {
  it.each(["--version", "-v"])("prints oid and the package version and nothing else for %s", async (flag) => {
    const { exitCode, stdout, stderr } = await run([flag]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`oid ${version}\n`);
    expect(stderr).toBe("");
  });

  it("is listed in the overview help", async () => {
    const { stdout } = await run(["--help"]);
    expect(stdout).toMatch(/^\s*-v, --version\s{2,}\S/m);
  });
});
