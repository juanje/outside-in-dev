import type { FindingDraft } from "../../src/artifacts/findings.js";
import type { OidWorld } from "./world.js";

/** The detectors of a scenario, scripted: they answer by the order of the calls, since the first call of a run is the baseline of its start. */
export class FakeDetector {
  /** What the detectors find when the run starts. */
  atStart: FindingDraft[] = [];
  /** What they find after Code Green. */
  afterGreen: FindingDraft[] = [];
  /** What they find after each change of the refactoring agent, in order; none beyond the list. */
  afterRefactor: FindingDraft[][] = [];
  /** The directory each call was made in. */
  calls: string[] = [];

  readonly detect = (worktree: string): FindingDraft[] => {
    const at = this.calls.length;
    this.calls.push(worktree);
    if (at === 0) return this.atStart;
    return at === 1 ? this.afterGreen : (this.afterRefactor[at - 2] ?? []);
  };
}

const detectors = new WeakMap<OidWorld, FakeDetector>();

/** The scripted detectors of the scenario. */
export function detectorOf(world: OidWorld): FakeDetector {
  const found = detectors.get(world) ?? new FakeDetector();
  detectors.set(world, found);
  return found;
}
