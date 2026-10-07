import { basename } from "node:path";
import { names } from "./names.js";
import { isDenied, locate, matchesGlob } from "./containment.js";
import { isSecret, reachesSecret } from "./secrets.js";
import { parseShell, type SimpleCommand } from "./shell-parse.js";

/** What the shell floor needs to know: the worktree, the project's quality-gate commands and the globs nobody writes and the orchestrator state no argument may name. */
export type ShellRules = { worktree: string; commands: string[]; deny: string[]; state: string[] };
export type ShellVerdict = { block: false } | { block: true; reason: string };
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

function blocked(reason: string): Blocked {
  return { block: true, reason };
}

function allowedCommands(rules: ShellRules): string[][] {
  const configured = rules.commands.flatMap((command) => {
    const parsed = parseShell(command);
    return parsed.ok ? parsed.commands.map((simple) => simple.words.map((word) => word.text)) : [];
  });
  return [...configured, ...PROBES.map((probe) => [probe])];
}

function writeVerdict(target: string, glob: boolean, rules: ShellRules): Blocked | undefined {
  if (target === NULL_DEVICE) return undefined;
  if (glob) return blocked(`A wildcard in "${target}", a path that is written, cannot be checked: name the files.`);
  const place = locate(rules.worktree, target);
  if (!place.inside) return blocked(`"${target}" is outside the worktree, which is the only place the shell may change.`);
  if (isDenied(place.relative, rules.deny)) return blocked(`"${target}" is a file that only the orchestrator writes (${place.relative || "the worktree root"}).`);
  return undefined;
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
    if (!place.inside) return blocked(`"${text}" is outside the worktree, which is the only place the shell may reach.`);
    if (rules.state.some((glob) => matchesGlob(place.relative, glob))) return blocked(`"${text}" names ${place.relative}, which only the orchestrator may touch: the shell cannot tell a read from a write, so no argument may name it.`);
  }
  return undefined;
}

function secretReason(text: string): Blocked {
  return blocked(`"${text}" is, or leads to, a secret file: no agent may read it, and nothing overrides that.`);
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
  return found === undefined ? undefined : blocked(`"${found.text}" reaches a secret file: no agent may read it, and nothing overrides that. Name the files you need.`);
}

function writtenTargets(name: string, simple: SimpleCommand): { text: string; glob: boolean }[] {
  const args = simple.words.slice(1);
  const redirected = simple.redirects.filter((redirect) => redirect.op !== INPUT).map((redirect) => ({ text: redirect.target, glob: redirect.glob }));
  const edits = WRITERS.has(name) || (IN_PLACE_EDITORS.has(name) && args.some((word) => IN_PLACE_FLAG.test(word.text)));
  const named = edits ? args.filter((word) => !word.text.startsWith(DASH)) : [];
  const outputs = name === "dd" ? args.filter((word) => word.text.startsWith(OUTPUT_PREFIX)).map((word) => ({ text: word.text.slice(OUTPUT_PREFIX.length), glob: word.glob })) : [];
  return [...named, ...outputs, ...redirected];
}

function wrapperVerdict(name: string, words: string[]): Blocked | undefined {
  if (name === "git") return blocked("git stays with the orchestrator: do not run git; commits, branches and checkpoints are not yours to change.");
  if (UNCHECKABLE.has(name)) return blocked(`"${name}" runs other commands in a way that cannot be checked.`);
  if (words.some((word) => INTERPRETERS.has(basename(word))) && words.some((word) => INLINE_FLAGS.has(word))) {
    return blocked("Inline code cannot be checked: write it in a file inside your writable paths and run that.");
  }
  return undefined;
}

function policyVerdict(words: string[], rules: ShellRules): Blocked | undefined {
  const allowed = allowedCommands(rules).some((prefix) => prefix.every((word, index) => words[index] === word));
  if (allowed) return undefined;
  return blocked(`"${words.join(SPACE)}" is not allowed in this step. You may run: ${rules.commands.join(LIST)}, and ${PROBES.join(LIST)}.`);
}

function shellVerdict(simple: SimpleCommand, rules: ShellRules, depth: number): ShellVerdict {
  const words = simple.words.map((word) => word.text);
  const flagIndex = words.findIndex((word, index) => index > 0 && !word.startsWith(DASH));
  const script = flagIndex < 0 ? undefined : words[flagIndex];
  if (script === undefined || !words.slice(1, flagIndex).some((flag) => SHELL_FLAGS.test(flag))) {
    return blocked("A shell script cannot be checked: run the project's commands directly.");
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
  const early = wrapperVerdict(name, words);
  if (early) return early;
  if (SHELLS.has(name)) return shellVerdict(simple, rules, depth);
  const reads = simple.redirects.filter((redirect) => redirect.op === INPUT).map((redirect) => redirect.target);
  const found = namedSecretVerdict(simple, rules) ?? reachVerdict(name, simple, rules) ?? writesVerdict(simple, name, rules) ?? containmentVerdict([...words, ...reads], rules) ?? (words.length > 0 ? policyVerdict(words, rules) : undefined);
  return found ?? ALLOWED;
}

/** The deterministic floor of the shell: whether `command` may run in the worktree. Anything it cannot settle is blocked, with the reason. */
export function checkShell(command: string, rules: ShellRules, depth = 0): ShellVerdict {
  if (depth > MAX_DEPTH) return blocked("The command nests shells too deeply to be checked.");
  const parsed = parseShell(command);
  if (!parsed.ok) return blocked(`The command was blocked: ${parsed.reason}.`);
  for (const simple of parsed.commands) {
    const verdict = simpleVerdict(simple, rules, depth);
    if (verdict.block) return verdict;
  }
  return ALLOWED;
}
