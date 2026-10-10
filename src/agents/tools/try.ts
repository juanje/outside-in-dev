import { Type } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { parseBddTarget, parseUnitTarget, UNIT_SEPARATOR } from "../../artifacts/verify-target.js";
import type { Runners } from "../../artifacts/verify-runner.js";
import { runTry } from "../../commands/try.js";
import { locate } from "../containment.js";
import { textContent } from "../result-text.js";

/** What the tool needs from the orchestrator: where the agent works and how the project's tools run. */
export type TryContext = { worktree: string; runners: Runners };

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
    async execute(_id, params) {
      const file = fileOf(params.target);
      if (file !== undefined && !locate(context.worktree, file).inside) return { content: textContent(`"${file}" is outside the worktree: you can try only a test or a scenario of this project.`), details: {} };
      let text = "";
      const io = { cwd: context.worktree, stdout: (part: string) => (text += part), stderr: (part: string) => (text += part) };
      runTry(io, [params.target, ...(params.dry_run === true ? ["--dry-run"] : [])], context.runners);
      return { content: textContent(text), details: {} };
    },
  });
}
