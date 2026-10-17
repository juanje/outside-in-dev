import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { parseBddTarget, parseUnitTarget, UNIT_SEPARATOR } from "../../artifacts/verify-target.js";
import { CommandAbortedError, type Runners } from "../../artifacts/verify-runner.js";
import { loadProjectConfig } from "../../artifacts/project-config.js";
import { type Rejection, rejection, renderRejection } from "../../artifacts/rejection.js";
import { runTry } from "../../commands/try.js";
import { filesMatching } from "../test-files.js";
import { locate } from "../containment.js";
import { textContent } from "../result-text.js";

/** How long one call of the tool may take: a small multiple of the slowest check measured in this project (8 s for one scenario or one unit test with the type check), because a long limit hides a hang. */
export const TRY_LIMIT_MS = 30_000;
const MS_PER_SECOND = 1000;
const FILE_SEPARATOR = ", ";
const ABORT_EVENT = "abort";
const STOPPED_WITH_SESSION = "The check was stopped because the session was stopped.";

/** What the agent is told when its check passed the limit and was stopped: what to do instead. */
function tookTooLong(limitMs: number, target: string): Rejection {
  const seconds = limitMs / MS_PER_SECOND;
  return rejection({
    failed: `Your check took longer than ${seconds} ${seconds === 1 ? "second" : "seconds"} and was stopped`,
    evidence: `target: ${target}`,
    next: "check a smaller target (one test or one scenario) or fix what hangs (a test that never ends, a watch mode), then try again",
  });
}

/** What the agent is told when it names a file outside the worktree: the target as the evidence, and the unit tests of the project it may try instead. */
function outsideTheWorktree(file: string, target: string, worktree: string): Rejection {
  const files = filesMatching(worktree, loadProjectConfig(worktree).paths.unit_tests);
  const such = files.length === 0 ? "" : `, such as ${files.join(FILE_SEPARATOR)},`;
  return rejection({
    failed: `"${file}" is outside the worktree: you can try only a test or a scenario of this project`,
    evidence: `target: ${target}`,
    next: `try a unit test of this project${such} as "<test file> > <test name>", or a scenario as "<feature file>:<line>"`,
  });
}

/** A promise that settles, with nothing, when the signal aborts. */
function whenAborted(signal: AbortSignal): Promise<undefined> {
  return new Promise((done) => {
    if (signal.aborted) done(undefined);
    signal.addEventListener(ABORT_EVENT, () => done(undefined), { once: true });
  });
}

/** What the tool needs from the orchestrator: where the agent works, how the project's tools run, and (for a test) the limit of one call, `TRY_LIMIT_MS` by default. */
export type TryContext = { worktree: string; runners: Runners; limitMs?: number };

/** The file a target names, when it names one: the test file of `<file> > <name>` or the feature file of `<file>:<line>`; a scenario named by its title names none. */
function fileOf(target: string): string | undefined {
  const scenario = parseBddTarget(target);
  if (scenario !== undefined) return scenario.file;
  return target.includes(UNIT_SEPARATOR) ? parseUnitTarget(target).file : undefined;
}

/** The `try` tool: the agent names one unit test or scenario and gets the short verdict of `oid try`, in seconds, without anything recorded or changed. */
export function tryTool(context: TryContext) {
  return defineTool({
    name: "try",
    label: "Try",
    description: "Check your work in seconds: runs only the unit test or the scenario you name, then the type check and the linter on the files you changed, and answers in a few lines. It changes nothing.",
    parameters: Type.Object({
      target: Type.String(),
      dry_run: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, session) {
      const file = fileOf(params.target);
      if (file !== undefined && !locate(context.worktree, file).inside) return { content: textContent(`${renderRejection(outsideTheWorktree(file, params.target, context.worktree))}\n`), details: {} };
      let text = "";
      const io = { cwd: context.worktree, stdout: (part: string) => (text += part), stderr: (part: string) => (text += part) };
      const limitMs = context.limitMs ?? TRY_LIMIT_MS;
      const limit = AbortSignal.timeout(limitMs);
      const stop = session === undefined ? limit : AbortSignal.any([session, limit]);
      const finished = runTry(io, [params.target, ...(params.dry_run === true ? ["--dry-run"] : [])], context.runners, { signal: stop }).then(
        () => text,
        (error: unknown) => {
          if (error instanceof CommandAbortedError) return undefined;
          throw error;
        },
      );
      // The race answers at the stop even from a runner that ignores the signal: a tool that waits for it would hang the session (Pi's abort waits for running tool calls).
      const verdict = await Promise.race([finished, whenAborted(stop)]);
      if (verdict !== undefined) return { content: textContent(verdict), details: {} };
      return { content: textContent(session?.aborted === true ? STOPPED_WITH_SESSION : `${renderRejection(tookTooLong(limitMs, params.target))}\n`), details: {} };
    },
  });
}
