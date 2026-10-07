import type { PiSdk } from "../agents/runner.js";

/** A person at a terminal: chooses one of the actions of a question and answers a line. */
export type Terminal = { isTTY: true; choose(prompt: string, actions: string[]): Promise<string>; line(prompt: string): Promise<string> };

/** How the review of the feature files reaches a person: a run without a terminal cannot ask. */
export type ReviewInput = { isTTY: false } | Terminal;

/** What the feature-writing states of a run take from outside: the Pi SDK their agents run on, the person who reviews and oid's agent directory. */
export type FeatureServices = { sdk?: PiSdk; input?: ReviewInput; agentDir: string };

/** What `oid run` takes from the process that runs it, so that nothing below `src/cli.ts` reads the process: the process id for the lock, and the services of the states. */
export type RunServices = FeatureServices & { pid: number };
