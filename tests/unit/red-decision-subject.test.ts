import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/events/bus.js";
import { decideRed } from "../../src/orchestrator/red-decision.js";
import { dir, useTempDir } from "./temp-project.js";

useTempDir();

describe("the decision about the Red of a unit test", () => {
  it("names the unit test as the thing that is wrong in the rejection when the person says the failure is a bug", async () => {
    const printed: string[] = [];
    const bus = createEventBus({ cwd: dir, runId: "run-1", write: (text) => printed.push(text), now: () => 0 });
    const red = { label: 'FR-A-01 unit test "cart > adds"', reason: "the test failed with an error that is not an assertion", message: "Error: boom", subject: "unit test" };
    const result = await decideRed(bus, { isTTY: true, choose: async () => "bug", line: async () => "" }, red);
    expect({ result, printed }).toEqual({
      result: { rejected: 'FR-A-01 unit test "cart > adds": the person judged the failure to be a bug in the unit test\nthe failure: Error: boom' },
      printed: [],
    });
  });
});
