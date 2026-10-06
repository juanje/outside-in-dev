import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/run-cli.js";

const compilerApi = vi.hoisted(() => ({ loaded: false }));

vi.mock("typescript-api", async (importActual) => {
  compilerApi.loaded = true;
  return importActual();
});

async function runIn(cwd: string, args: string[]) {
  let stdout = "";
  const exitCode = await runCli(args, { cwd, stdout: (text) => (stdout += text), stderr: () => undefined });
  return { exitCode, stdout };
}

describe("commands load only when they run", () => {
  it("does not load the TypeScript compiler API to print the overview help", async () => {
    const { exitCode, stdout } = await runIn(".", ["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Outside-In");
    expect(compilerApi.loaded).toBe(false);
  });

  it("does not load the TypeScript compiler API to show progress", async () => {
    const project = mkdtempSync(join(tmpdir(), "oid-unit-"));
    try {
      writeFileSync(join(project, "progress.json"), JSON.stringify({ current_focus: null, features: [{ id: "FR-X-01", title: "Alpha", status: "pending" }] }));
      const { exitCode, stdout } = await runIn(project, ["progress", "status"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("FR-X-01");
      expect(compilerApi.loaded).toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
