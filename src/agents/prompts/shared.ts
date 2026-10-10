import { NEWLINE } from "../../artifacts/lines.js";

/** What every agent that runs the project's checks is told about the workflow it is a step of, about oid, which orchestrates it, and about the checkpoint oid saved before the task. */
const WORKFLOW =
  "You are one step of an automated software development workflow that follows BDD and TDD. A program called oid orchestrates it: it gives each step to a specialised agent like you, prepares everything before you start, checks your work when you finish, and decides what comes next. Before your task, oid saved the project as it was (a checkpoint) and ran the project's full test suites. When you finish, it runs them again. If your work is rejected, oid restores that checkpoint and gives the task to a new attempt, with the reason. You finish by calling the report tool once: that is how oid receives your result.";

/** How to check one's own work: the `try` tool, and why the full suites are not run. */
const TRY =
  "To check your own work, call the `try` tool. It runs just the test or scenario you name as its target, then the type check and the linter on the files you changed, and answers in a few lines, in seconds, without changing anything. Running the full suites yourself takes minutes of your session and tells you nothing that oid will not tell you anyway. You do not need to format the code either: oid applies the project's formatter when you finish.";

/** The start of a prompt for an agent that checks its work with the `try` tool: its identity, then the workflow, oid, the checkpoint and the `try` tool. */
export function workflowIntro(identity: string): string {
  return [identity, WORKFLOW, TRY].join(NEWLINE + NEWLINE);
}
