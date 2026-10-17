import type { Agent } from "@earendil-works/pi-agent-core";
import { locate, matchesGlob, mayWrite } from "./containment.js";
import { type Rejection, rejection, renderRejection } from "../artifacts/rejection.js";
import type { Profile } from "./profiles.js";
import { textContent, textOf } from "./result-text.js";
import { withoutSecrets } from "./secret-results.js";
import { isSecret } from "./secrets.js";
import { checkShell } from "./shell-floor.js";
import { isText, pathsOf } from "./tool-paths.js";

/** What the sandbox needs of a session: the hook to chain to and `abort`. */
export type SandboxSession = { agent: Pick<Agent, "beforeToolCall" | "afterToolCall">; abort(): Promise<void> };
export type SandboxOptions = { worktree: string; tools: string[]; maxDenials?: number };

/** More denials than this in one session abort it (`limits.sandbox_denials_abort`). */
export const SANDBOX_DENIALS_ABORT = 5;

const SHELL = "bash";
const WRITING_TOOLS = new Set(["write", "edit"]);
const LIST = ", ";
const SLASH = "/";
const CURRENT = ".";
const WILDCARD = /[*?[]/;

/** Whether `path` is the directory a glob starts in (everything before its first wildcard segment) or is under it; a glob that starts with a wildcard only reaches the worktree root. */
function inGlobDirectory(path: string, glob: string): boolean {
  const segments = glob.split(SLASH);
  const wild = segments.findIndex((segment) => WILDCARD.test(segment));
  if (wild < 0) return false;
  const directory = segments.slice(0, wild).join(SLASH);
  return directory === "" ? path === "" : path === directory || path.startsWith(`${directory}${SLASH}`);
}

function mayRead(profile: Profile, tool: string, path: string): boolean {
  const globs = [...profile.read, ...profile.write];
  const searches = tool !== "read";
  return globs.some((glob) => matchesGlob(path, glob) || (searches && inGlobDirectory(path, glob)));
}

function pathReason(profile: Profile, tool: string, requested: string, worktree: string): Rejection | undefined {
  const place = locate(worktree, requested);
  const writing = WRITING_TOOLS.has(tool);
  const allowed = place.inside && (writing ? mayWrite(place.relative, profile.write, profile.deny) : mayRead(profile, tool, place.relative));
  if (allowed) return undefined;
  const where = place.inside ? "" : " (it is outside the worktree)";
  return rejection({
    failed: `"${requested}" is not ${writing ? "writable" : "readable"} in this step${where}`,
    evidence: `tool: ${tool}, path: ${requested}`,
    next: `You may write: ${profile.write.join(LIST)}. You may read: ${profile.read.join(LIST)}.`,
  });
}

function secretReason(paths: string[], tool: string, worktree: string): Rejection | undefined {
  const secret = paths.find((path) => isSecret(worktree, path));
  if (secret === undefined) return undefined;
  return rejection({
    failed: `"${secret}" is a secret file: no agent may read it, and nothing overrides that`,
    evidence: `tool: ${tool}, path: ${secret}`,
    next: "name a file that is not secret; if the task needs this one, call the report tool with status blocked and say why",
  });
}

const LISTING_TOOLS = new Set(["grep", "find", "ls"]);

/** What a tool a step does not have can be replaced with, as examples of the tools it has. */
const SUBSTITUTES: [string, string][] = [["ls", "the ls tool to list files"], ["read", "the read tool to read a file"]];

/** Why a tool is not offered in this step, and which tools to use instead. */
function unavailable(tool: string, args: unknown, options: SandboxOptions): Rejection {
  const command = (args as { command?: unknown } | undefined)?.command;
  const have = options.tools.join(LIST);
  if (tool !== SHELL) return rejection({ failed: `The tool "${tool}" is not available in this step`, evidence: `tool: ${tool}`, next: `use one of the tools of this step: ${have}` });
  const instead = SUBSTITUTES.filter(([name]) => options.tools.includes(name)).map(([, example]) => example);
  return rejection({
    failed: "This step has no shell",
    evidence: isText(command) ? `tool: ${tool}, command: ${command}` : `tool: ${tool}`,
    next: `do the same with a tool of this step${instead.length === 0 ? "" : `, for example ${instead.join(" and ")}`} (you have: ${have})`,
  });
}

function callReason(profile: Profile, options: SandboxOptions, tool: string, args: unknown): Rejection | undefined {
  if (!options.tools.includes(tool)) return unavailable(tool, args, options);
  const paths = pathsOf(tool, args);
  if (paths === undefined) {
    return rejection({ failed: `The call to "${tool}" was blocked: its path is missing or the tool is unknown to the sandbox`, evidence: `tool: ${tool}, arguments: ${JSON.stringify(args)}`, next: `call a tool of this step (${options.tools.join(LIST)}) with the path it needs` });
  }
  if (tool === SHELL) {
    const { command } = args as { command?: unknown };
    if (!isText(command)) return rejection({ failed: "The shell call has no command", evidence: `tool: ${tool}`, next: "call bash again with the command to run" });
    const verdict = checkShell(command, { worktree: options.worktree, commands: profile.commands, write: profile.write, deny: profile.deny, state: profile.orchestratorState });
    return verdict.block ? verdict.reason : undefined;
  }
  return secretReason(paths, tool, options.worktree) ?? paths.map((path) => pathReason(profile, tool, path, options.worktree)).find((reason) => reason !== undefined);
}

/** Installs the sandbox on `session.agent.beforeToolCall`, chained to the hook already there: a blocked call returns its reason to the agent, and more than `maxDenials` blocked calls abort the session. */
export function installSandbox(session: SandboxSession, profile: Profile, options: SandboxOptions): void {
  const original = session.agent.beforeToolCall;
  const limit = options.maxDenials ?? SANDBOX_DENIALS_ABORT;
  let denials = 0;
  session.agent.beforeToolCall = async (context, signal) => {
    const prior = await original?.(context, signal);
    if (prior?.block) return prior;
    const reason = callReason(profile, options, context.toolCall.name, context.args);
    if (reason === undefined) return prior;
    denials += 1;
    // Not awaited: Pi's abort() waits for the running tool calls, and this denial is one of them.
    if (denials > limit) void session.abort().catch(() => undefined);
    return { block: true, reason: renderRejection(reason) };
  };
  const originalAfter = session.agent.afterToolCall;
  session.agent.afterToolCall = async (context, signal) => {
    const prior = await originalAfter?.(context, signal);
    const name = context.toolCall.name;
    // A failed search answers with the error of ripgrep or fd, which has no file lines to attribute.
    if (!LISTING_TOOLS.has(name) || context.isError) return prior;
    const given = (context.args as { path?: unknown } | undefined)?.path;
    const directory = isText(given) ? given : CURRENT;
    const parts = prior?.content ?? context.result.content;
    const text = textOf(parts);
    return { ...prior, content: textContent(withoutSecrets(name, text, directory, options.worktree)), details: undefined };
  };
}
