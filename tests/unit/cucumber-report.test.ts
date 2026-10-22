import { describe, expect, it } from "vitest";
import { failingFile, failingFrame, normalizeCucumberReport } from "../../src/artifacts/cucumber-report.js";
import { scenarioMessages } from "./cucumber-messages.js";

describe("normalizeCucumberReport", () => {
  it("lists the status and the message of each step of the scenario in order, leaving the hooks out", () => {
    const report = scenarioMessages([{ status: "PASSED" }, { status: "FAILED", message: "AssertionError: 1 !== 2" }, { status: "SKIPPED" }]);
    expect(normalizeCucumberReport(report)).toEqual([
      { status: "PASSED", message: "" },
      { status: "FAILED", message: "AssertionError: 1 !== 2" },
      { status: "SKIPPED", message: "" },
    ]);
  });

  it("reports a failure that cucumber typed as an assertion, or that carries ERR_ASSERTION, as an assertion that keeps its stack frames", () => {
    const frames = "    + expected - actual\n\n    at World.<anonymous> (/p/features/steps/s.ts:4:10)";
    const typed = { status: "FAILED", message: `{"code":"ERR_ASSERTION"}\n${frames}`, exception: { type: "AssertionError", message: "" } };
    const coded = { status: "FAILED", message: `{"generatedMessage":false,"code":"ERR_ASSERTION"}\n${frames}` };
    const [first, second] = normalizeCucumberReport(scenarioMessages([typed, coded]));
    expect(first!.message).toBe("AssertionError\n    at World.<anonymous> (/p/features/steps/s.ts:4:10)");
    expect(second).toEqual(first);
  });
});

describe("failingFrame", () => {
  const chaiFrames = (modules: string) =>
    [
      "AssertionError: expected [] to have a length of 1 but got +0",
      `    at Proxy.<anonymous> (file://${modules}/@vitest/expect/dist/index.js:1257:20)`,
      `    at Proxy.<anonymous> (file://${modules}/@vitest/expect/dist/index.js:1029:14)`,
      `    at Proxy.methodWrapper (${modules}/chai/index.js:1686:25)`,
      "    at /home/u/proj/tests/unit/event-bus.test.ts:47:25",
      `    at file://${modules}/@vitest/runner/dist/chunk-hooks.js:155:11`,
    ].join("\n");

  it("skips the frames of node_modules inside the project and gives the test line", () => {
    expect(failingFrame(chaiFrames("/home/u/proj/node_modules"), "/home/u/proj")).toEqual({ file: "tests/unit/event-bus.test.ts", line: 47 });
  });

  it("skips the frames of a node_modules outside the project and gives the test line", () => {
    expect(failingFrame(chaiFrames("/home/u/shared/node_modules"), "/home/u/proj")).toEqual({ file: "tests/unit/event-bus.test.ts", line: 47 });
  });
});

describe("failingFile", () => {
  const message = (frame: string) => `TypeError: shout is not a function\n    ${frame}`;

  it("gives the project file of the first stack frame, with or without a function name", () => {
    expect(failingFile(message("at World.<anonymous> (/p/features/steps/a.steps.ts:6:105)"), "/p")).toBe("features/steps/a.steps.ts");
    expect(failingFile(message("at /p/features/steps/a.steps.ts:6:105"), "/p")).toBe("features/steps/a.steps.ts");
  });

  it("gives nothing when the first frame is outside the project or there is no frame", () => {
    expect([failingFile(message("at node:internal/modules/run_main:1:1"), "/p"), failingFile(message("at x (/q/other.ts:1:1)"), "/p"), failingFile("TypeError: x", "/p")]).toEqual([undefined, undefined, undefined]);
  });
});
