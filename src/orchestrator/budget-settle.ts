import { loadBudgetLimits } from "../artifacts/project-config.js";
import type { Started } from "./begin.js";
import { costReason, costStop } from "./budget.js";
import { askAboutBudget, EXTEND } from "./budget-question.js";
import type { FeatureServices } from "./services.js";
import { extendCostLimit, extensionsOf, spendOf } from "./session.js";

/** Ends the run from deep inside a state, with the exit code of the process: thrown where a person's answer stops the run, caught where the run is held. */
export class RunStopped extends Error {
  constructor(readonly code: number) {
    super(`the run stopped with the exit code ${code}`);
  }
}

/** Puts a limit that was reached to the person and returns when the person extends it; any other answer stops the run. */
export async function askToExtend({ bus }: Started, services: FeatureServices, stop: { state: string; reason: string }): Promise<void> {
  const answer = await askAboutBudget(bus, services.input ?? { isTTY: false }, stop);
  if (answer !== EXTEND) throw new RunStopped(answer);
}

/** Settles the cost limits before a billable call of `state`: while the run or the feature has spent its limit, the person is asked, and extending raises the limit once more. */
export async function settleBudget(started: Started, services: FeatureServices, state: string, fr: string = started.targets[0]!): Promise<void> {
  const { cwd, workspace } = started;
  const limits = loadBudgetLimits(workspace.path);
  for (;;) {
    const stop = costStop({ spend: spendOf(cwd), fr, limits, extensions: extensionsOf(cwd) });
    if (stop === undefined) return;
    await askToExtend(started, services, { state, reason: costReason(stop) });
    extendCostLimit(cwd);
  }
}
