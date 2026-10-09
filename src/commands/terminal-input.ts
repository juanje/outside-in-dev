import { type Readable, Writable } from "node:stream";
import { EOL } from "node:os";
import { createInterface } from "node:readline";
import type { Terminal } from "../orchestrator/services.js";
import { LIST_SEPARATOR } from "../ui/plain.js";

/** The actions of a question as a sentence: "a, b or c". */
function sentence(actions: string[]): string {
  return `${actions.slice(0, -1).join(LIST_SEPARATOR)} or ${actions.at(-1)}`;
}

/** A person at a terminal: each question is shown on `stdout` and answered with one line from `stdin`. */
export function terminalInput(stdin: Readable, stdout: Writable): Terminal & { secret(prompt: string): Promise<string> } {
  const ask = (text: string): Promise<string> =>
    new Promise((resolve) => {
      const lines = createInterface({ input: stdin, output: stdout });
      lines.once("close", () => resolve(""));
      lines.question(text, (answer) => {
        resolve(answer);
        lines.close();
      });
    });
  const askHidden = (text: string): Promise<string> =>
    new Promise((resolve) => {
      stdout.write(text);
      const lines = createInterface({ input: stdin, output: new Writable({ write: (_chunk, _encoding, done) => done() }), terminal: true });
      lines.once("close", () => resolve(""));
      lines.once("line", (answer) => {
        stdout.write(EOL);
        resolve(answer);
        lines.close();
      });
    });
  return {
    isTTY: true,
    secret: askHidden,
    choose: async (prompt, actions) => (await ask(`${prompt}\n\nAnswer ${sentence(actions)}: `)).trim().toLowerCase(),
    line: ask,
  };
}
