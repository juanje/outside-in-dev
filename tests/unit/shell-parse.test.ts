import { describe, expect, it } from "vitest";
import { parseShell } from "../../src/agents/shell-parse.js";

function wordsOf(command: string): string[][] {
  const parsed = parseShell(command);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.commands.map((simple) => simple.words.map((word) => word.text));
}

describe("parseShell", () => {
  it("splits a command line into simple commands with their words and redirections", () => {
    expect(wordsOf("npx vitest run tests/a.test.ts")).toEqual([["npx", "vitest", "run", "tests/a.test.ts"]]);
    expect(wordsOf('npm run build && NODE_OPTIONS="--import tsx" npx cucumber-js')).toEqual([
      ["npm", "run", "build"],
      ["NODE_OPTIONS=--import tsx", "npx", "cucumber-js"],
    ]);
    expect(wordsOf("echo 'a b' \"c d\" e\\ f; ls || pwd | wc\nls")).toEqual([["echo", "a b", "c d", "e f"], ["ls"], ["pwd"], ["wc"], ["ls"]]);

    const redirected = parseShell("echo hi > out.txt 2>&1 >> log.txt 2> err.txt < in.txt &> all.txt >&2");
    expect(redirected).toEqual({
      ok: true,
      commands: [
        {
          words: [
            { text: "echo", glob: false },
            { text: "hi", glob: false },
          ],
          redirects: [
            { op: ">", target: "out.txt", glob: false },
            { op: ">>", target: "log.txt", glob: false },
            { op: ">", target: "err.txt", glob: false },
            { op: "<", target: "in.txt", glob: false },
            { op: ">", target: "all.txt", glob: false },
          ],
        },
      ],
    });

    const globbed = parseShell("rm src/* 'x*'");
    expect(globbed.ok && globbed.commands[0]?.words.map((word) => word.glob)).toEqual([false, true, false]);
  });

  it("refuses what it cannot settle and says why", () => {
    for (const unsettled of ["echo $(ls)", "echo $HOME", 'echo "$HOME"', "echo `ls`", 'echo "`ls`"', "cat <<EOF", "cat <<< x", "sleep 1 &", "echo 'abc", 'echo "abc', "(ls)", "echo {a,b}", "echo x >", "echo x # y", "echo x\\"]) {
      const parsed = parseShell(unsettled);
      expect(parsed.ok, unsettled).toBe(false);
      expect(!parsed.ok && parsed.reason.length, unsettled).toBeGreaterThan(0);
    }
  });
});
