/** The Cucumber Messages of one scenario run: a hook step, then one step per status, each with the message the runner gave it. */
export function scenarioMessages(steps: { status: string; message?: string }[]): string {
  const testCase = { testCase: { id: "c1", testSteps: [{ id: "hook" }, ...steps.map((_, at) => ({ id: `s${at}`, pickleStepId: `p${at}` }))] } };
  const started = { testCaseStarted: { id: "r1", testCaseId: "c1" } };
  const finished = [{ id: "hook", status: "PASSED" }, ...steps.map((step, at) => ({ id: `s${at}`, ...step }))].map(({ id, status, message }) => ({
    testStepFinished: { testCaseStartedId: "r1", testStepId: id, testStepResult: { status, ...(message === undefined ? {} : { message }) } },
  }));
  return [{ meta: {} }, testCase, started, ...finished].map((line) => JSON.stringify(line)).join("\n");
}
