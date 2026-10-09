/** An output that keeps what the command wrote to the standard output. */
export function output() {
  let text = "";
  return { io: { cwd: "/nowhere", stdout: (chunk: string) => (text += chunk), stderr: () => undefined }, text: () => text };
}

/** A terminal that answers `line` questions from a script, in order, and keeps the questions it was asked; a question beyond the script fails. */
export function scriptedTerminal(answers: string[]) {
  const asked: string[] = [];
  const hidden: string[] = [];
  const remaining = [...answers];
  const next = (prompt: string): string => {
    asked.push(prompt);
    const answer = remaining.shift();
    if (answer === undefined) throw new Error(`the terminal was asked a question the script does not answer: ${prompt}`);
    return answer;
  };
  return {
    isTTY: true as const,
    asked,
    hidden,
    line: async (prompt: string) => next(prompt),
    choose: async (prompt: string, _actions: string[]) => next(prompt),
    secret: async (prompt: string) => {
      hidden.push(prompt);
      return next(prompt);
    },
  };
}
