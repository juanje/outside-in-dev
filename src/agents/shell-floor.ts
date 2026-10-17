import { basename } from "node:path";
import { names } from "./names.js";
import { isDenied, locate, matchesGlob, mayWrite } from "./containment.js";
import { type Rejection, type RejectionParts, rejection } from "../artifacts/rejection.js";
import { isSecret, reachesSecret } from "./secrets.js";
import { parseShell, type SimpleCommand } from "./shell-parse.js";

/** What the shell floor needs to know: the worktree, the project's quality-gate commands and the globs the step may write, the globs nobody writes and the orchestrator state no argument may name. */
export type ShellRules = { worktree: string; commands: string[]; write: string[]; deny: string[]; state: string[] };
export type ShellVerdict = { block: false } | { block: true; reason: Rejection };
type Blocked = Extract<ShellVerdict, { block: true }>;

const MAX_DEPTH = 4;
const SHELLS = new Set(names("bash sh zsh dash"));
const INTERPRETERS = new Set(names("node tsx ts-node python python3 ruby perl deno bun"));
const INLINE_FLAGS = new Set(names("-e -p -c -pe --eval --print"));
const UNCHECKABLE = new Set(names("eval source . exec xargs env sudo nohup time timeout command builtin cd pushd popd export alias trap ssh"));
const WRITERS = new Set(names("rm rmdir mv cp touch mkdir tee ln chmod chown truncate install unlink shred rsync patch"));
const IN_PLACE_EDITORS = new Set(names("sed perl"));
const PROBES = names("ls cat head tail wc pwd echo grep diff sort uniq mkdir touch rm mv cp");
const NAMES_ONLY = new Set(names("ls echo pwd mkdir touch rm"));
const GREPS = new Set(names("grep egrep fgrep"));
const RECURSIVE_FLAG = /^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive|--dereference-recursive)$/;
const FOLLOWING_FLAG = /^(-[a-zA-Z]*R[a-zA-Z]*|--dereference-recursive)$/;
const HERE = ".";
const INPUT = "<";
const PATTERN_AND_PATH = 2;
const SHELL_FLAGS = /^-[a-zA-Z]*c[a-zA-Z]*$/;
const IN_PLACE_FLAG = /^(-[a-zA-Z]*i|--in-place)/;
const FLAG_VALUE = /^(?:--?[\w-]+|[A-Za-z_]\w*)=(.*)$/;
const DASH = "-";
const SPACE = " ";
const LIST = ", ";
const OUTPUT_PREFIX = "of=";
const NULL_DEVICE = "/dev/null";
const ALLOWED: ShellVerdict = { block: false };
const NAME_THE_FILES = "name the files you need that are not secret";

function blocked(parts: RejectionParts): Blocked {
  return { block: true, reason: rejection(parts) };
}

/** The argument of a command that was blocked, as the evidence. */
const argumentEvidence = (text: string): string => `argument: ${text}`;

/** The evidence of a blocked command: the command, as the agent wrote it. */
const commandEvidence = (command: string): string => `command: ${command}`;

function allowedCommands(rules: ShellRules): string[][] {
  const configured = rules.commands.flatMap((command) => {
    const parsed = parseShell(command);
    return parsed.ok ? parsed.commands.map((simple) => simple.words.map((word) => word.text)) : [];
  });
  return [...configured, ...PROBES.map((probe) => [probe])];
}

function writeVerdict(target: string, glob: boolean, rules: ShellRules): Blocked | undefined {
  if (target === NULL_DEVICE) return undefined;
  const mayWriteOnly = `write only what this step may write: ${rules.write.join(LIST)}`;
  if (glob) return blocked({ failed: `A wildcard in "${target}", a path that is written, cannot be checked`, evidence: argumentEvidence(target), next: "name the files you write, one by one" });
  const place = locate(rules.worktree, target);
  if (!place.inside) return blocked({ failed: `"${target}" is outside the worktree, which is the only place the shell may change`, evidence: argumentEvidence(target), next: mayWriteOnly });
  if (mayWrite(place.relative, rules.write, rules.deny)) return undefined;
  if (isDenied(place.relative, rules.deny)) {
    return blocked({ failed: `"${target}" is a file that only the orchestrator writes`, evidence: `${argumentEvidence(target)} (${place.relative || "the worktree root"})`, next: mayWriteOnly });
  }
  return blocked({ failed: `"${target}" is not writable in this step`, evidence: argumentEvidence(target), next: `You may write: ${rules.write.join(LIST)}.` });
}

function argumentValue(text: string): string | undefined {
  const value = FLAG_VALUE.exec(text)?.[1] ?? text;
  return value === "" || value.startsWith(DASH) ? undefined : value;
}

/** Every argument, and the value of every `--option=value`, is a path to the shell: it must stay inside the worktree and must not name what only the orchestrator owns, whatever the command does with it. */
function containmentVerdict(texts: string[], rules: ShellRules): Blocked | undefined {
  for (const text of texts) {
    const value = argumentValue(text);
    if (value === undefined || value === NULL_DEVICE) continue;
    const place = locate(rules.worktree, value);
    if (!place.inside) return blocked({ failed: `"${text}" is outside the worktree, which is the only place the shell may reach`, evidence: argumentEvidence(text), next: "use a path inside the worktree" });
    if (rules.state.some((glob) => matchesGlob(place.relative, glob))) {
      const evidence = `${argumentEvidence(text)}: the shell cannot tell a read from a write, so no argument may name ${place.relative}`;
      return blocked({ failed: `"${text}" names ${place.relative}, which only the orchestrator may touch`, evidence, next: "leave it out of the command: what you need from it is not yours to read or change, so call the report tool with status blocked if the task needs it" });
    }
  }
  return undefined;
}

function secretReason(text: string): Blocked {
  return blocked({ failed: `"${text}" is, or leads to, a secret file: no agent may read it, and nothing overrides that`, evidence: argumentEvidence(text), next: NAME_THE_FILES });
}

/** Every argument, `--option=value` value and input redirect that is a secret. */
function namedSecretVerdict(simple: SimpleCommand, rules: ShellRules): Blocked | undefined {
  const texts = [...simple.words.map((word) => word.text), ...simple.redirects.filter((redirect) => redirect.op === INPUT).map((redirect) => redirect.target)];
  const named = texts.find((text) => {
    const value = argumentValue(text);
    return value !== undefined && isSecret(rules.worktree, value);
  });
  return named === undefined ? undefined : secretReason(named);
}

/** The directories and wildcards a command may read through: a recursive search of the worktree and every file a wildcard expands to must not reach a secret, and what the floor cannot walk is blocked. */
function reachVerdict(name: string, simple: SimpleCommand, rules: ShellRules): Blocked | undefined {
  if (NAMES_ONLY.has(name)) return undefined;
  const flags = simple.words.slice(1).filter((word) => word.text.startsWith(DASH));
  const operands = simple.words.slice(1).filter((word) => !word.text.startsWith(DASH));
  const searches = GREPS.has(name) && flags.some((flag) => RECURSIVE_FLAG.test(flag.text));
  const links = !GREPS.has(name) || flags.some((flag) => FOLLOWING_FLAG.test(flag.text));
  const reached = searches && operands.length < PATTERN_AND_PATH ? [...operands, { text: HERE, glob: false }] : operands;
  const found = reached.find((operand) => reachesSecret(rules.worktree, operand.text, { glob: operand.glob, links }));
  return found === undefined ? undefined : blocked({ failed: `"${found.text}" reaches a secret file: no agent may read it, and nothing overrides that`, evidence: argumentEvidence(found.text), next: NAME_THE_FILES });
}

function writtenTargets(name: string, simple: SimpleCommand): { text: string; glob: boolean }[] {
  const args = simple.words.slice(1);
  const redirected = simple.redirects.filter((redirect) => redirect.op !== INPUT).map((redirect) => ({ text: redirect.target, glob: redirect.glob }));
  const edits = WRITERS.has(name) || (IN_PLACE_EDITORS.has(name) && args.some((word) => IN_PLACE_FLAG.test(word.text)));
  const named = edits ? args.filter((word) => !word.text.startsWith(DASH)) : [];
  const outputs = name === "dd" ? args.filter((word) => word.text.startsWith(OUTPUT_PREFIX)).map((word) => ({ text: word.text.slice(OUTPUT_PREFIX.length), glob: word.glob })) : [];
  return [...named, ...outputs, ...redirected];
}

function wrapperVerdict(name: string, words: string[], rules: ShellRules): Blocked | undefined {
  const evidence = commandEvidence(words.join(SPACE));
  if (name === "git") return blocked({ failed: "git stays with the orchestrator", evidence, next: `leave commits, branches and checkpoints to the orchestrator, and run the project's commands directly: ${rules.commands.join(LIST)}` });
  if (UNCHECKABLE.has(name)) return blocked({ failed: `"${name}" runs other commands in a way that cannot be checked`, evidence, next: `run the command you need directly: ${rules.commands.join(LIST)}` });
  if (words.some((word) => INTERPRETERS.has(basename(word))) && words.some((word) => INLINE_FLAGS.has(word))) {
    return blocked({ failed: "Inline code cannot be checked", evidence, next: `write it in a file inside your writable paths (${rules.write.join(LIST)}) and run that file` });
  }
  return undefined;
}

function policyVerdict(words: string[], rules: ShellRules): Blocked | undefined {
  const allowed = allowedCommands(rules).some((prefix) => prefix.every((word, index) => words[index] === word));
  if (allowed) return undefined;
  return blocked({ failed: `"${words.join(SPACE)}" is not allowed in this step`, evidence: commandEvidence(words.join(SPACE)), next: `You may run: ${rules.commands.join(LIST)}, and ${PROBES.join(LIST)}.` });
}

function shellVerdict(simple: SimpleCommand, rules: ShellRules, depth: number): ShellVerdict {
  const words = simple.words.map((word) => word.text);
  const flagIndex = words.findIndex((word, index) => index > 0 && !word.startsWith(DASH));
  const script = flagIndex < 0 ? undefined : words[flagIndex];
  if (script === undefined || !words.slice(1, flagIndex).some((flag) => SHELL_FLAGS.test(flag))) {
    return blocked({ failed: "A shell script cannot be checked", evidence: commandEvidence(words.join(SPACE)), next: `run the project's commands directly: ${rules.commands.join(LIST)}` });
  }
  const inner = checkShell(script, rules, depth + 1);
  return inner.block ? inner : (writesVerdict(simple, "sh", rules) ?? ALLOWED);
}

function writesVerdict(simple: SimpleCommand, name: string, rules: ShellRules): Blocked | undefined {
  for (const target of writtenTargets(name, simple)) {
    const verdict = writeVerdict(target.text, target.glob, rules);
    if (verdict) return verdict;
  }
  return undefined;
}

function simpleVerdict(simple: SimpleCommand, rules: ShellRules, depth: number): ShellVerdict {
  const words = simple.words.map((word) => word.text);
  const name = basename(words[0] ?? "");
  const early = wrapperVerdict(name, words, rules);
  if (early) return early;
  if (SHELLS.has(name)) return shellVerdict(simple, rules, depth);
  const reads = simple.redirects.filter((redirect) => redirect.op === INPUT).map((redirect) => redirect.target);
  const found = namedSecretVerdict(simple, rules) ?? reachVerdict(name, simple, rules) ?? writesVerdict(simple, name, rules) ?? containmentVerdict([...words, ...reads], rules) ?? (words.length > 0 ? policyVerdict(words, rules) : undefined);
  return found ?? ALLOWED;
}

/** The deterministic floor of the shell: whether `command` may run in the worktree. Anything it cannot settle is blocked, with the reason. */
export function checkShell(command: string, rules: ShellRules, depth = 0): ShellVerdict {
  if (depth > MAX_DEPTH) return blocked({ failed: "The command nests shells too deeply to be checked", evidence: commandEvidence(command), next: "run each command on its own, without a shell inside a shell" });
  const parsed = parseShell(command);
  if (!parsed.ok) return blocked({ failed: `The command was blocked: ${parsed.reason}`, evidence: commandEvidence(command), next: "write the command as plain words, one command at a time" });
  for (const simple of parsed.commands) {
    const verdict = simpleVerdict(simple, rules, depth);
    if (verdict.block) return verdict;
  }
  return ALLOWED;
}
