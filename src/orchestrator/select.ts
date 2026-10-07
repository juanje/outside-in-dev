import { FEATURE_STATUS, ProgressError, requireFeature, type Progress } from "../artifacts/progress.js";
import type { RunArgs } from "./run-args.js";

/** Throws when `id` cannot be a target of the run: SPEC.md does not define it, the progress file does not track it or it is not pending. */
function requireTarget(id: string, specIds: string[], progress: Progress): void {
  if (!specIds.includes(id)) throw new ProgressError(`${id} is not in SPEC.md`);
  if (requireFeature(progress, id).status !== FEATURE_STATUS.pending) throw new ProgressError(`${id} is not pending`);
}

/** The features a run works on, in order: those given, or the pending ones of the progress file, at most `maxFrs`. */
export function selectTargets(options: Pick<RunArgs, "fr" | "maxFrs">, specIds: string[], progress: Progress): string[] {
  options.fr.forEach((id) => requireTarget(id, specIds, progress));
  const pending = progress.features.filter((feature) => feature.status === FEATURE_STATUS.pending).map((feature) => feature.id);
  return (options.fr.length > 0 ? options.fr : pending).slice(0, options.maxFrs);
}
