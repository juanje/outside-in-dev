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

  it("shows the question of a secret and returns the line that was typed without showing it", async () => {
    const { input, stdin, shown } = terminal();
    const answer = input.secret("API key: ");
    stdin.write("sk-typed-hidden-5\n");
    expect(await answer).toBe("sk-typed-hidden-5");
    expect(shown()).toContain("API key: ");
    expect(shown().includes("sk-typed-hidden-5")).toBe(false);
  });

  it("shows a free-text question followed by exactly one space, so the typed answer does not stick to it", async () => {
    const { input, stdin, shown } = terminal();
    const first = input.line("Why is this scenario a guard?");
    stdin.write("Nothing is configured\n");
    expect(await first).toBe("Nothing is configured");
    const second = input.line("Provider to log in to: ");
    stdin.write("openai\n");
    await second;
    expect(shown()).toBe("Why is this scenario a guard? Provider to log in to: ");
  });

  it("returns an empty answer when the input ends before a line is typed", async () => {
    const { input, stdin } = terminal();
    const answer = input.choose("Review the feature files", ["approve", "edit", "reject"]);
    stdin.end();
    expect(await answer).toBe("");
  });
});
