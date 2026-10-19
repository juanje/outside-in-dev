import { describe, expect, it } from "vitest";
import type { OIEventBody } from "../../src/events/types.js";
import { announceRefactor } from "../../src/orchestrator/run-refactor.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("announceRefactor", () => {
  it("announces the refactor agent at the effort the user set for REFACTOR, on the model role it names", () => {
    write("config.json", JSON.stringify({ models: { fast: "p/small", default: "p/medium", strong: "p/large" }, effort: { REFACTOR: { thinking: "high", model: "strong" } } }));
    const events: OIEventBody[] = [];
    const effort = announceRefactor({ emit: (event: OIEventBody) => void events.push(event) }, dir);
    expect(effort).toEqual({ model: "p/large", thinkingLevel: "high" });
    expect(events).toEqual([{ type: "agent_start", state: "REFACTOR", role: "coder-agent", attempt: 1, model: "p/large", thinkingLevel: "high" }]);
  });
});
