import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extendCostLimit, extensionsOf, recordSpend } from "../../src/orchestrator/session.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const readSession = () => JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8"));

describe("extendCostLimit", () => {
  it("counts each extension of the cost limit in the saved session, from none", () => {
    write(".outside-in/session.json", JSON.stringify({ runId: "run-1", state: "TDD_RED" }));
    expect(extensionsOf(dir)).toBe(0);
    extendCostLimit(dir);
    extendCostLimit(dir);
    expect(extensionsOf(dir)).toBe(2);
    expect(readSession()).toEqual({ runId: "run-1", state: "TDD_RED", extensions: 2 });
  });
});

describe("recordSpend", () => {
  it("adds what a call cost to the spend of the run and of its feature in the saved session", () => {
    write(".outside-in/session.json", JSON.stringify({ runId: "run-1", state: "TDD_RED" }));
    recordSpend(dir, "FR-A-01", { usd: 0.25, tokens: 100 });
    recordSpend(dir, "FR-A-01", { usd: 0.5, tokens: 50 });
    recordSpend(dir, "FR-A-02", { usd: 1, tokens: 1 });
    expect(readSession()).toEqual({ runId: "run-1", state: "TDD_RED", spend: { usd: 1.75, tokens: 151, byFr: { "FR-A-01": { usd: 0.75, tokens: 150 }, "FR-A-02": { usd: 1, tokens: 1 } } } });
  });
});
