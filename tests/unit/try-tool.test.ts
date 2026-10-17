import { describe, expect, it } from "vitest";
import { tryTool } from "../../src/agents/tools/try.js";
import { REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { printedParts } from "./rejection-fixture.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

/** A vitest JSON report of one file holding one passing test. */
function passingReport(): unknown {
  return { testResults: [{ name: `${dir}/tests/a.test.ts`, status: "passed", message: "", assertionResults: [{ title: "adds up", fullName: "adds up", ancestorTitles: [], status: "passed", failureMessages: [] }] }] };
}

/** Runners whose unit test passes and whose type check is clean; the calls of the unit runner are kept in `calls`. */
function passingRunners(calls: string[] = []): Runners {
  return {
    ...REAL_RUNNERS,
    tryUnitTest: (_cwd, _command, test) => {
      calls.push(`${test.file} > ${test.name}`);
      return { exitCode: 0, report: passingReport(), stderr: "" };
    },
    tryTypecheck: () => ({ exitCode: 0, output: "" }),
  };
}

/** What the tool answers to the arguments, as text. */
async function answerTo(runners: Runners, args: { target: string; dry_run?: boolean }, config: Record<string, unknown> = {}): Promise<string> {
  writeMinimalConfig(config);
  const result = await tryTool({ worktree: dir, runners }).execute("call-1", args as never, undefined, undefined, {} as never);
  return result.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

const PATHS = { source: ["src/**"], shared: [], unit_tests: ["tests/**/*.test.ts"], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };

describe("tryTool", () => {
  it("tells what failed, the target as the evidence and a unit test of the project to try instead, when it refuses a target outside the worktree", async () => {
    write("tests/a.test.ts", "// test\n");
    const answer = await answerTo(passingRunners(), { target: "../outside.test.ts > adds up" }, { paths: PATHS });
    expect(answer).toBe(
      printedParts(
        '"../outside.test.ts" is outside the worktree: you can try only a test or a scenario of this project',
        "target: ../outside.test.ts > adds up",
        'try a unit test of this project, such as tests/a.test.ts, as "<test file> > <test name>", or a scenario as "<feature file>:<line>"',
      ),
    );
  });

  it("answers with the lines of oid try for the test it is given, in the worktree", async () => {
    const calls: string[] = [];
    const answer = await answerTo(passingRunners(calls), { target: "tests/a.test.ts > adds up" });
    expect(answer).toBe("test: passed\ntypes: ok\nlint: skipped (commands.lint is null)\ntry: ok\n");
    expect(calls).toEqual(["tests/a.test.ts > adds up"]);
  });

  it("refuses a test file or a scenario file outside the worktree, and runs nothing", async () => {
    const calls: string[] = [];
    for (const target of ["../outside.test.ts > adds up", "/etc/hosts.test.ts > adds up", "../outside.feature:3"]) {
      const answer = await answerTo(passingRunners(calls), { target });
      expect(answer).toContain("outside the worktree");
    }
    expect(calls).toEqual([]);
  });
});
