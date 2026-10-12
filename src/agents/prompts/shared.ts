import { NEWLINE } from "../../artifacts/lines.js";
import type { Profile } from "../profiles.js";

/** What every agent that runs the project's checks is told about the workflow it is a step of, about oid, which orchestrates it, and about the checkpoint oid saved before the task. */
const WORKFLOW =
  "You are one step of an automated software development workflow that follows BDD and TDD. A program called oid orchestrates it: it gives each step to a specialised agent like you, prepares everything before you start, checks your work when you finish, and decides what comes next. Before your task, oid saved the project as it was (a checkpoint) and ran the project's full test suites. When you finish, it runs them again. If your work is rejected, oid restores that checkpoint and gives the task to a new attempt, with the reason. You finish by calling the report tool once: that is how oid receives your result.";

/** The same for the agent that writes the feature files, for whom no suite runs: oid checks its files. */
const FEATURE_WORKFLOW =
  "You are one step of an automated software development workflow that follows BDD and TDD. A program called oid orchestrates it: it gives each step to a specialised agent like you, prepares everything before you start, checks your work when you finish, and decides what comes next. Before your task, oid saved the project as it was (a checkpoint). When you finish, it checks your feature files. If your work is rejected, oid restores that checkpoint and gives the task to a new attempt, with the reason. You finish by calling the report tool once: that is how oid receives your result.";

/** How to check one's own work: the `try` tool, and why the full suites are not run. */
const TRY =
  "To check your own work, call the `try` tool. It runs just the test or scenario you name as its target, then the type check and the linter on the files you changed, and answers in a few lines, in seconds, without changing anything. Running the full suites yourself takes minutes of your session and tells you nothing that oid will not tell you anyway. You do not need to format the code either: oid applies the project's formatter when you finish.";

/** What every agent that changes code holds about tests, findings and checks: they are evidence about the code, fixed at their cause (log rows 198–200, run 3). */
const FIX_AT_CAUSE =
  "You fix problems at their cause. A failing test, a finding or a failing check is evidence about the code, and the goal is code that is easier to read, change and trust: never a quieter detector, and never a test that passes for the wrong reason. So you never change what judges the code (the checks, the patterns they forbid, the way test reports are read), never weaken a verification, never shape the code to one test or one input, and never add to the source code that exists only for the tests, such as state kept so that a test can ask about it. When the honest fix is outside what you may change, or no honest fix exists, call the report tool with status blocked and say why: the person can then fix it in one step, while a hidden problem is rejected and the work is redone.";

const LIST = ", ";

/** What a step's agent may write and read, from its profile (the same globs the sandbox names when it refuses a path), and that a refused path is not worth probing. */
export function accessStatement(profile: Profile): string {
  return `You may write: ${profile.write.join(LIST)}. You may read: ${profile.read.join(LIST)}. A path you may not read is refused at once; do not search for it.`;
}

/** The start of a prompt for an agent that checks its work with the `try` tool: its identity, then the workflow, oid, the checkpoint and the `try` tool. */
export function workflowIntro(identity: string): string {
  return [identity, WORKFLOW, TRY].join(NEWLINE + NEWLINE);
}

/** The start of a prompt for an agent that changes code: its identity, how it treats problems, then the workflow and the `try` tool. */
export function codeIntro(identity: string): string {
  return [identity, FIX_AT_CAUSE, WORKFLOW, TRY].join(NEWLINE + NEWLINE);
}

/** The start of a prompt for the agent that writes feature files, which has no `try` tool: its identity, then the workflow, oid and the checkpoint. */
export function featureIntro(identity: string): string {
  return [identity, FEATURE_WORKFLOW].join(NEWLINE + NEWLINE);
}
