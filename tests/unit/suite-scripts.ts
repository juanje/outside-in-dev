/** The unit runner of a test project: a vitest JSON report with one test of the given status. */
export const UNIT_SCRIPT = (status: string) => `
const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice(13);
const test = { fullName: "totals > adds", title: "adds", status: "${status}", failureMessages: ${status === "failed" ? '["boom"]' : "[]"} };
require("node:fs").writeFileSync(out, JSON.stringify({ testResults: [{ name: process.cwd() + "/tests/totals.test.ts", message: "", assertionResults: [test] }] }));
`;

/** The BDD runner of a test project: a Cucumber Messages report with one scenario whose only step has the given status. */
export const BDD_SCRIPT = (status: string) => `
const out = process.argv[process.argv.indexOf("--format") + 1].slice(8);
const lines = [
  { pickle: { id: "p", uri: "features/pay.feature", name: "Pay", steps: [{ id: "ps", text: "I pay" }] } },
  { testCase: { id: "c", pickleId: "p", testSteps: [{ id: "s", pickleStepId: "ps" }] } },
  { testCaseStarted: { id: "r", testCaseId: "c" } },
  { testStepFinished: { testCaseStartedId: "r", testStepId: "s", testStepResult: { status: "${status}" } } },
];
require("node:fs").writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\\n") + "\\n");
`;
