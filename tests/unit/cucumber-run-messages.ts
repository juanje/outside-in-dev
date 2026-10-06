export interface RunScenario {
  uri: string;
  name: string;
  steps: { text: string; status: string; message?: string }[];
}

/** The Cucumber Messages of runs of several scenarios: each pickle, its test case, its start and the end of each of its steps. */
export function runMessages(scenarios: RunScenario[]): string {
  return scenarios
    .flatMap(({ uri, name, steps }, at) => [
      { pickle: { id: `p${at}`, uri, name, steps: steps.map((step, stepAt) => ({ id: `p${at}s${stepAt}`, text: step.text })) } },
      { testCase: { id: `c${at}`, pickleId: `p${at}`, testSteps: steps.map((_, stepAt) => ({ id: `t${at}s${stepAt}`, pickleStepId: `p${at}s${stepAt}` })) } },
      { testCaseStarted: { id: `r${at}`, testCaseId: `c${at}` } },
      ...steps.map(({ status, message }, stepAt) => ({
        testStepFinished: { testCaseStartedId: `r${at}`, testStepId: `t${at}s${stepAt}`, testStepResult: { status, ...(message === undefined ? {} : { message }) } },
      })),
    ])
    .map((line) => JSON.stringify(line))
    .join("\n");
}
