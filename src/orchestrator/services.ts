import type { Detector } from "../artifacts/detect-all.js";
import { REAL_RUNNERS, type Runners } from "../artifacts/verify-runner.js";
import type { PiSdk } from "../agents/runner.js";
import type { DoctorServices } from "../commands/doctor.js";

/** A person at a terminal: chooses one of the actions of a question and answers a line. */
export type Terminal = { isTTY: true; choose(prompt: string, actions: string[]): Promise<string>; line(prompt: string): Promise<string> };

/** How the review of the feature files reaches a person: a run without a terminal cannot ask. */
export type ReviewInput = { isTTY: false } | Terminal;

/** What the states of a run take from outside: the Pi SDK their agents run on, the person who reviews, oid's agent directory, the user's configuration directory (a run without it passes no model to Pi), the detectors of code health (a run without them uses the detectors of `oid metrics`) and the runners of the unit suite, the BDD scenarios, the type check and the other commands (a run without them starts a process for each). */
export type FeatureServices = { sdk?: PiSdk; input?: ReviewInput; agentDir: string; configDir?: string; detect?: Detector; runners?: Runners };

/** The runners a run uses: the ones its services give, else the ones that start a process. */
export function runnersOf(services: FeatureServices): Runners {
  return services.runners ?? REAL_RUNNERS;
}

/** What `oid run` and `oid resume` take from the process that runs them, so that nothing below `src/cli.ts` reads the process: the process id for the lock, the services of the states and, when given, where to check the user's setup (the checks of `oid doctor`) before anything starts; a run without it makes no such check. */
export type RunServices = FeatureServices & { pid: number; aborted?: () => boolean; preflight?: DoctorServices };
