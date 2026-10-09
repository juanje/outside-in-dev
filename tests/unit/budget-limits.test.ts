import { describe, expect, it } from "vitest";
import { loadBudgetLimits } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadBudgetLimits", () => {
  it("limits no cost, 40 turns and 600 seconds for each session without a configuration file", () => {
    expect(loadBudgetLimits(dir)).toEqual({ costUsd: undefined, costFrUsd: undefined, maxTurns: 40, timeoutS: 600 });
  });

  it("takes the limits from cost_limit_usd, cost_limit_fr_usd, agent_max_turns and agent_timeout_s", () => {
    writeMinimalConfig({ limits: { cost_limit_usd: 5.5, cost_limit_fr_usd: 2, agent_max_turns: 3, agent_timeout_s: 9 } });
    expect(loadBudgetLimits(dir)).toEqual({ costUsd: 5.5, costFrUsd: 2, maxTurns: 3, timeoutS: 9 });
  });
});
