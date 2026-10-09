import type { SessionLimits } from "../agents/runner.js";
import type { BudgetLimits } from "../artifacts/project-config.js";

/** What was spent: dollars and tokens. */
export type Spend = { usd: number; tokens: number };

/** What a run has spent, and what each feature of it has. */
export type RunSpend = Spend & { byFr: Record<string, Spend> };

/** The cost limits of the project; a limit that is not set does not stop anything. */
export type CostLimits = { costUsd?: number; costFrUsd?: number };

const RUN_SCOPE = "run";

/** A cost limit that was reached: for the whole run or for one feature, what was spent and the limit that applies. */
export type CostStop = { scope: typeof RUN_SCOPE; spent: number; limit: number } | { scope: "fr"; fr: string; spent: number; limit: number };

const MS_PER_SECOND = 1000;

/** The limits one agent session runs with: the turns and the seconds of the project, which grow by their own size for each time the person extended them for this call, and what to tell of the cost. */
export function sessionLimits({ maxTurns, timeoutS }: Pick<BudgetLimits, "maxTurns" | "timeoutS">, extended: number, onUsage: SessionLimits["onUsage"]): SessionLimits {
  const times = extended + 1;
  return { maxTurns: maxTurns * times, timeoutMs: timeoutS * times * MS_PER_SECOND, onUsage };
}

const DOLLAR_PRECISION = 10_000;

/** A sum of dollars as a person reads it, without the noise of floating point. */
const dollars = (amount: number): number => Math.round(amount * DOLLAR_PRECISION) / DOLLAR_PRECISION;

/** Says which cost limit was reached: who spent what, and the limit that applies. */
export function costReason(stop: CostStop): string {
  if (stop.scope === RUN_SCOPE) return `the run has spent ${dollars(stop.spent)} dollars, and its limit is ${dollars(stop.limit)}`;
  return `${stop.fr} has spent ${dollars(stop.spent)} dollars, and the limit for a feature is ${dollars(stop.limit)}`;
}

/** What asks for a stop before the next call: the cost spent when it has reached a limit of the project, which counts once more for each extension, nothing otherwise. */
export function costStop({ spend, fr, limits, extensions }: { spend: RunSpend; fr: string; limits: CostLimits; extensions: number }): CostStop | undefined {
  const times = extensions + 1;
  if (limits.costUsd !== undefined && spend.usd >= limits.costUsd * times) return { scope: RUN_SCOPE, spent: spend.usd, limit: limits.costUsd * times };
  const spentOnFr = spend.byFr[fr]?.usd ?? 0;
  if (limits.costFrUsd !== undefined && spentOnFr >= limits.costFrUsd * times) return { scope: "fr", fr, spent: spentOnFr, limit: limits.costFrUsd * times };
  return undefined;
}
