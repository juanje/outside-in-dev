import type { Agent } from "@earendil-works/pi-agent-core";
import { isDenied, locate, matchesGlob } from "./containment.js";
import type { Profile } from "./profiles.js";
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

function pathReason(profile: Profile, tool: string, requested: string, worktree: string): string | undefined {
  const place = locate(worktree, requested);
  const writing = WRITING_TOOLS.has(tool);
  const allowed = place.inside && (writing ? !isDenied(place.relative, profile.deny) && profile.write.some((glob) => matchesGlob(place.relative, glob)) : mayRead(profile, tool, place.relative));
  if (allowed) return undefined;
  const where = place.inside ? "" : " (it is outside the worktree)";
  return `"${requested}" is not ${writing ? "writable" : "readable"} in this step${where}. You may write: ${profile.write.join(LIST)}. You may read: ${profile.read.join(LIST)}.`;
}

function secretReason(paths: string[], worktree: string): string | undefined {
  const secret = paths.find((path) => isSecret(worktree, path));
  return secret === undefined ? undefined : `"${secret}" is a secret file: no agent may read it, and nothing overrides that.`;
}

const LISTING_TOOLS = new Set(["grep", "find", "ls"]);

function callReason(profile: Profile, options: SandboxOptions, tool: string, args: unknown): string | undefined {
  if (!options.tools.includes(tool)) {
    return tool === SHELL ? "This step has no shell." : `The tool "${tool}" is not available in this step. You have: ${options.tools.join(LIST)}.`;
  }
  const paths = pathsOf(tool, args);
  if (paths === undefined) return `The call to "${tool}" was blocked: its path is missing or the tool is unknown to the sandbox.`;
  if (tool === SHELL) {
    const { command } = args as { command?: unknown };
    if (!isText(command)) return "The shell call has no command.";
    const verdict = checkShell(command, { worktree: options.worktree, commands: profile.commands, deny: profile.deny, state: profile.orchestratorState });
    return verdict.block ? verdict.reason : undefined;
  }
  return secretReason(paths, options.worktree) ?? paths.map((path) => pathReason(profile, tool, path, options.worktree)).find((reason) => reason !== undefined);
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
    if (denials > limit) await session.abort().catch(() => undefined);
    return { block: true, reason };
  };
  const originalAfter = session.agent.afterToolCall;
  session.agent.afterToolCall = async (context, signal) => {
    const prior = await originalAfter?.(context, signal);
    const name = context.toolCall.name;
    if (!LISTING_TOOLS.has(name)) return prior;
    const given = (context.args as { path?: unknown } | undefined)?.path;
    const directory = isText(given) ? given : CURRENT;
    const parts = prior?.content ?? context.result.content;
    const text = parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    return { ...prior, content: [{ type: "text", text: withoutSecrets(name, text, directory, options.worktree) }], details: undefined };
  };
}
