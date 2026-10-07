import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { terminalInput } from "../../src/commands/terminal-input.js";

function terminal() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let shown = "";
  stdout.on("data", (chunk: Buffer) => (shown += chunk.toString()));
  return { input: terminalInput(stdin, stdout), stdin, shown: () => shown };
}

describe("the review at a terminal", () => {
  it("shows the question with its actions and returns the action that was typed, in lower case", async () => {
    const { input, stdin, shown } = terminal();
    const answer = input.choose("Review the feature files", ["approve", "edit", "reject"]);
    stdin.write("  Approve \n");
    expect(await answer).toBe("approve");
    expect(shown()).toContain("Review the feature files");
    expect(shown()).toContain("approve, edit or reject");
  });

  it("returns an empty answer when the input ends before a line is typed", async () => {
    const { input, stdin } = terminal();
    const answer = input.choose("Review the feature files", ["approve", "edit", "reject"]);
    stdin.end();
    expect(await answer).toBe("");
  });
});
