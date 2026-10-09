import { describe, expect, it } from "vitest";
import { attemptEffort } from "../../src/orchestrator/attempt-effort.js";

const MODELS = { fast: "p/small", default: "p/medium", strong: "p/large" };

describe("attemptEffort", () => {
  it("runs the first attempt on the default model at the medium thinking level", () => {
    expect(attemptEffort({ attempt: 1, retries: 2, models: MODELS })).toEqual({ model: "p/medium", thinkingLevel: "medium" });
  });

  it("raises the thinking level on a retry that is not the last attempt", () => {
    expect(attemptEffort({ attempt: 2, retries: 3, models: MODELS })).toEqual({ model: "p/medium", thinkingLevel: "high" });
  });

  it("runs the last attempt on the strong model at the high thinking level", () => {
    expect(attemptEffort({ attempt: 3, retries: 2, models: MODELS })).toEqual({ model: "p/large", thinkingLevel: "high" });
  });
});
