export const URI = "features/a.feature";

export interface ReportStep {
  keyword: string;
  text: string;
  status: string;
  message?: string;
  /** What the step attached to its run, as plain text. */
  attached?: string[];
  /** The media type of what the step attached; plain text by default. */
  mediaType?: string;
}

/** A report of one scenario whose steps have these keywords, texts and statuses, written as Cucumber writes it: the keyword is in the Gherkin document, the text in the pickle, the attachments between the start and the end of their step. */
export function gherkinReport(steps: ReportStep[], { name = "Shout", hookAttached = [], otherRunAttached = [] }: { name?: string; hookAttached?: string[]; otherRunAttached?: string[] } = {}): string {
  const gherkinSteps = steps.map(({ keyword, text }, at) => ({ id: `g${at}`, keyword, text, location: { line: 4 + at, column: 5 } }));
  const document = { gherkinDocument: { uri: URI, feature: { name: "Greeting", children: [{ scenario: { id: "sc", name, steps: gherkinSteps } }] } } };
  const pickle = { pickle: { id: "p", uri: URI, name, steps: steps.map(({ text }, at) => ({ id: `ps${at}`, text, astNodeIds: [`g${at}`] })) } };
  const testCase = { testCase: { id: "c", pickleId: "p", testSteps: steps.map((_, at) => ({ id: `t${at}`, pickleStepId: `ps${at}` })) } };
  const started = { testCaseStarted: { id: "r", testCaseId: "c" } };
  const ran = steps.flatMap(({ status, message, attached = [], mediaType = "text/plain" }, at) => [
    ...attached.map((body) => ({ attachment: { testCaseStartedId: "r", testStepId: `t${at}`, body, mediaType, contentEncoding: "IDENTITY" } })),
    { testStepFinished: { testCaseStartedId: "r", testStepId: `t${at}`, testStepResult: { status, ...(message === undefined ? {} : { message }) } } },
  ]);
  const attachedBy = (run: string, testStepId: string, bodies: string[]) => bodies.map((body) => ({ attachment: { testCaseStartedId: run, testStepId, body, mediaType: "text/plain", contentEncoding: "IDENTITY" } }));
  return [document, pickle, testCase, started, ...ran, ...attachedBy("r", "hook", hookAttached), ...attachedBy("other", "hook-of-other", otherRunAttached)].map((line) => JSON.stringify(line)).join("\n");
}
