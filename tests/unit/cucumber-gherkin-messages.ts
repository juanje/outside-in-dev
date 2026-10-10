export const URI = "features/a.feature";

export interface ReportStep {
  keyword: string;
  /** The kind Cucumber gives the keyword in the Gherkin document: `Context`, `Action`, `Outcome` or `Conjunction`; left out when the report has none. */
  keywordType?: string;
  text: string;
  status: string;
  message?: string;
  /** What the step attached to its run, as plain text. */
  attached?: string[];
  /** The media type of what the step attached; plain text by default. */
  mediaType?: string;
}

/** A report of one scenario whose steps have these keywords, texts and statuses, written as Cucumber writes it: the keyword is in the Gherkin document, the text in the pickle, the attachments between the start and the end of their step. */
export function gherkinReport(
  steps: ReportStep[],
  { name = "Shout", hookAttached = [], otherRunAttached = [], background = 0 }: { name?: string; hookAttached?: string[]; otherRunAttached?: string[]; background?: number } = {},
): string {
  const gherkinSteps = steps.map(({ keyword, keywordType, text }, at) => ({ id: `g${at}`, keyword, ...(keywordType === undefined ? {} : { keywordType }), text, location: { line: 4 + at, column: 5 } }));
  const children = [...(background > 0 ? [{ background: { id: "bg", steps: gherkinSteps.slice(0, background) } }] : []), { scenario: { id: "sc", name, steps: gherkinSteps.slice(background) } }];
  const document = { gherkinDocument: { uri: URI, feature: { name: "Greeting", children } } };
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
