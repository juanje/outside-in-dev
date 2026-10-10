import { describe, expect, it } from "vitest";
import { tryTool } from "../../src/agents/tools/try.js";
import { REAL_RUNNERS, type Runners } from "../../src/artifacts/verify-runner.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

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
    typecheck: () => ({ exitCode: 0, output: "" }),
  };
}

/** What the tool answers to the arguments, as text. */
async function answerTo(runners: Runners, args: { target: string; dry_run?: boolean }): Promise<string> {
  writeMinimalConfig();
  const result = await tryTool({ worktree: dir, runners }).execute("call-1", args as never, undefined, undefined, {} as never);
  return result.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

describe("tryTool", () => {
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
