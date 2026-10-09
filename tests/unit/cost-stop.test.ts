import { describe, expect, it } from "vitest";
import { costReason, costStop, sessionLimits } from "../../src/orchestrator/budget.js";

const SPEND = { usd: 0.06, tokens: 6000, byFr: { "FR-A-01": { usd: 0.06, tokens: 6000 } } };

describe("costStop", () => {
  it("stops at the run limit once the run has spent it", () => {
    expect(costStop({ spend: SPEND, fr: "FR-A-01", limits: { costUsd: 0.05 }, extensions: 0 })).toEqual({ scope: "run", spent: 0.06, limit: 0.05 });
  });

  it("adds the limit once more for each extension, for the run and for a feature", () => {
    const limits = { costUsd: 0.05, costFrUsd: 0.05 };
    expect(costStop({ spend: SPEND, fr: "FR-A-01", limits, extensions: 1 })).toBeUndefined();
    expect(costStop({ spend: { ...SPEND, usd: 0.12 }, fr: "FR-A-01", limits, extensions: 1 })).toEqual({ scope: "run", spent: 0.12, limit: 0.1 });
    expect(costStop({ spend: { usd: 0, tokens: 0, byFr: { "FR-A-01": { usd: 1.6, tokens: 1 } } }, fr: "FR-A-01", limits: { costFrUsd: 0.5 }, extensions: 2 })).toEqual({ scope: "fr", fr: "FR-A-01", spent: 1.6, limit: 1.5 });
  });

  it("stops at the limit of a feature once that feature has spent it, with no limit on the run", () => {
    expect(costStop({ spend: SPEND, fr: "FR-A-01", limits: { costFrUsd: 0.05 }, extensions: 0 })).toEqual({ scope: "fr", fr: "FR-A-01", spent: 0.06, limit: 0.05 });
  });
});

describe("sessionLimits", () => {
  it("turns the turns and the seconds of the project into the limits of a session, which grow by their own size for each time the person extended them", () => {
    const onUsage = () => false;
    expect(sessionLimits({ maxTurns: 40, timeoutS: 600 }, 0, onUsage)).toEqual({ maxTurns: 40, timeoutMs: 600_000, onUsage });
    expect(sessionLimits({ maxTurns: 2, timeoutS: 1 }, 2, onUsage)).toEqual({ maxTurns: 6, timeoutMs: 3000, onUsage });
  });
});

describe("costReason", () => {
  it("says what the run or the feature has spent and the limit, without the noise of floating point sums", () => {
    expect(costReason({ scope: "run", spent: 0.1 + 0.2, limit: 0.25 })).toBe("the run has spent 0.3 dollars, and its limit is 0.25");
    expect(costReason({ scope: "fr", fr: "FR-A-01", spent: 0.06, limit: 0.05 })).toBe("FR-A-01 has spent 0.06 dollars, and the limit for a feature is 0.05");
  });
});
