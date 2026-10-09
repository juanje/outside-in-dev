#!/usr/bin/env node
// Claude Code hooks for working on oid (docs/BOOTSTRAP.md §2.5): they make the cycle rules mechanical.
//   after-edit   (PostToolUse on Edit|Write|MultiEdit): while a feature is focused, run `oid verify integrity`.
//   before-step  (PreToolUse on Bash): `oid progress step <FR> <step>` moving forward (bdd_red → tdd_red,
//                tdd_red → tdd_green, tdd_green → refactor or quality_gate, refactor → quality_gate) needs the
//                matching `oid verify` to have passed for that feature on the content there is now: any change
//                since the verification (other than progress.json and .outside-in/) invalidates it. Going back
//                to a Red needs nothing. The verification is read from the feature's checkpoint
//                (.outside-in/checkpoints/<FR>.json), or from the single .outside-in/checkpoint.json when the
//                feature has none and that one names it (as oid up to v0.6.3 writes it). Before
//                `oid verify red|green` replaces a checkpoint, the changes since the last one must pass
//                `oid verify integrity`, or a violation would be absorbed.
//                `oid progress revise` is refused: the human runs it in their own terminal (ADR-039);
//                `oid progress reopen` is the agent's and is not. The move from bdd_red to quality_gate
//                that ends a revise with no code to write (ADR-041) is the orchestrating session's: it is refused
//                from a subagent and let through from the main session with no override (ADR-046).
//                An `oid` command with `--help` or `-h` runs nothing, so none of these checks apply to it.
//                Only the commands the shell would run count: text in a heredoc, a comment or a quoted string
//                does not.
//   before-edit  (PreToolUse on Edit|Write|MultiEdit): run `oid verify integrity --path <file>` on the file about
//                to be changed and block the edit when oid refuses it (exit 1), passing oid's line on, which
//                names the step to move to. It judges the path by its kind only: approved scenarios (ADR-040)
//                and forbidden patterns are still judged by after-edit, on the content. Writes from Bash (sed,
//                heredocs, patch) do not go through it. It fails open: if oid is missing or fails in any other
//                way, or the input has no file_path, the edit is allowed.
//   overrides    (ADR-045): an `oid verify` or `oid progress step` prefixed with OID_OVERRIDE="<cause>" skips the
//                integrity and evidence checks, only from the main session:
//                Claude Code marks a subagent's tool call with `agent_id`, and a subagent's override is refused.
//                Each override is appended to .outside-in/overrides.ndjson with its date, command and cause,
//                before the command runs: a line is an attempt, and oid may still refuse the command itself. An
//                override that cannot be recorded is refused.
//                `oid progress revise` is refused with or without it.
// Exit 2 tells Claude Code to show stderr to the agent (and, before a tool call, to block it).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BLOCK = 2;
const VERIFY_FOR_STEP = { bdd_red: "oid verify red <feature file>:<line>", tdd_red: 'oid verify red "<test file> > <test name>"', tdd_green: "oid verify green" };
/** The checkpoint step each move forward needs, by `<from> <to>`: a green is recorded as tdd_green. Any other move needs none. */
const EVIDENCE_FOR_MOVE = {
  "bdd_red tdd_red": "bdd_red",
  "tdd_red tdd_green": "tdd_red",
  "tdd_green refactor": "tdd_green",
  "tdd_green quality_gate": "tdd_green",
  "refactor quality_gate": "tdd_green",
};
/** Words that run the command that follows them: `oid` behind one of them is still oid. */
const WRAPPERS = new Set(["env", "command", "exec", "time", "nice", "npx", "rtk", "proxy"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** The variable that marks an `oid verify` or `oid progress step` as an override by the orchestrating session (ADR-045); its value is the cause. */
const OVERRIDE = "OID_OVERRIDE";

const project = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined);
const block = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(BLOCK);
};

/** The delimiter of a heredoc that starts at `at` (just after `<<` or `<<-`), and where its word ends. */
function heredocDelimiter(text, at) {
  let end = at;
  while (text[end] === " " || text[end] === "\t") end++;
  let word = "";
  while (end < text.length && !/[\s;&|()<>]/.test(text[end])) {
    const quote = text[end];
    if (quote === "'" || quote === '"') {
      const close = text.indexOf(quote, end + 1);
      word += text.slice(end + 1, close < 0 ? text.length : close);
      end = close < 0 ? text.length : close + 1;
    } else {
      word += text[end] === "\\" ? text[++end] ?? "" : text[end];
      end++;
    }
  }
  return { word, end };
}

/** Where a quoted string that opens at `at` ends (just after its closing quote), and its content. */
function quoted(text, at) {
  const quote = text[at];
  let end = at + 1;
  let content = "";
  while (end < text.length && text[end] !== quote) {
    if (quote === '"' && text[end] === "\\") end++;
    content += text[end] ?? "";
    end++;
  }
  return { content, end: end + 1 };
}

/** The simple commands a shell line runs, each as its words: quoted strings are words, and heredoc bodies and comments are left out. */
function commandsOf(text) {
  const commands = [];
  let words = [];
  let word = null;
  const heredocs = [];
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === "\n") {
      endCommand();
      for (const { delimiter, tabs } of heredocs.splice(0)) {
        while (at < text.length) {
          const next = text.indexOf("\n", at + 1);
          const line = text.slice(at + 1, next < 0 ? text.length : next);
          at = next < 0 ? text.length : next;
          if ((tabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
        }
      }
    } else if (char === " " || char === "\t") endWord();
    else if (";&|()".includes(char)) endCommand();
    else if (char === "#" && word === null) at = (text.indexOf("\n", at) < 0 ? text.length : text.indexOf("\n", at)) - 1;
    else if (char === "'" || char === '"') {
      const { content, end } = quoted(text, at);
      word = (word ?? "") + content;
      at = end - 1;
    } else if (char === "\\") word = (word ?? "") + (text[++at] === "\n" ? "" : text[at] ?? "");
    else if (text.startsWith("<<", at) && text[at + 2] !== "<") {
      endWord();
      const tabs = text[at + 2] === "-";
      const { word: delimiter, end } = heredocDelimiter(text, at + (tabs ? 3 : 2));
      heredocs.push({ delimiter, tabs });
      at = end - 1;
    } else word = (word ?? "") + char;
  }
  endCommand();
  return commands;
}

/** Each `oid` command the line runs: its arguments, behind any variable assignments and wrappers, and those assignments. */
function oidCommands(text) {
  return commandsOf(text).flatMap((words) => {
    let at = 0;
    const assignments = {};
    for (; at < words.length && (ASSIGNMENT.test(words[at]) || WRAPPERS.has(words[at])); at++) {
      const equals = words[at].indexOf("=");
      if (ASSIGNMENT.test(words[at])) assignments[words[at].slice(0, equals)] = words[at].slice(equals + 1);
    }
    return words[at] === "oid" || words[at]?.endsWith("/oid") ? [{ args: words.slice(at + 1), assignments }] : [];
  });
}

/** While a feature is focused, blocks with what `oid verify integrity` reports, if anything. */
function requireIntegrity(what) {
  const progress = readJson(join(project, "progress.json"));
  if (!progress?.current_focus) return;
  const run = spawnSync("oid", ["verify", "integrity"], { cwd: project, encoding: "utf8" });
  if (run.status !== 0) block(`oid verify integrity found a problem ${what}:\n${run.stdout}${run.stderr}`);
}

const afterEdit = () => requireIntegrity("with this change");

/** The NUL-separated names `git` prints for `args` in the project. */
const gitNames = (args) => (spawnSync("git", args, { cwd: project }).stdout?.toString() ?? "").split("\0").filter((name) => name !== "");

/** The hash of a file of the project as the checkpoint records it, or undefined when it does not exist. */
function hashOf(name) {
  const path = join(project, name);
  return existsSync(path) && lstatSync(path).isFile() ? createHash("sha256").update(readFileSync(path)).digest("hex") : undefined;
}

/** The files whose content is not the one the checkpoint verified: same comparison as oid's changedSinceCheckpoint (snapshot hashes, recorded deletions, HEAD for the rest), leaving out progress.json and .outside-in/. */
function changedSinceVerified(checkpoint) {
  const tokens = gitNames(["diff", "--name-status", "--no-renames", "-z", "HEAD"]);
  const fromHead = new Set(gitNames(["ls-files", "--others", "--exclude-standard", "-z"]));
  for (let at = 1; at < tokens.length; at += 2) fromHead.add(tokens[at]);
  const snapshot = checkpoint.snapshot ?? {};
  const deleted = checkpoint.deleted ?? [];
  const names = new Set([...fromHead, ...Object.keys(snapshot), ...deleted]);
  return [...names].filter((name) => {
    if (name === "progress.json" || name.startsWith(".outside-in/")) return false;
    if (name in snapshot) return hashOf(name) !== snapshot[name];
    if (deleted.includes(name)) return hashOf(name) !== undefined;
    return true;
  });
}

/** The checkpoint of a feature: its own, or the single one when it has none and that one names it. */
function checkpointOf(id) {
  const own = readJson(join(project, ".outside-in", "checkpoints", `${id}.json`));
  if (own !== undefined) return own;
  const single = readJson(join(project, ".outside-in", "checkpoint.json"));
  return single?.feature === id ? single : undefined;
}

/** Blocks `oid progress step <id> <to>` when it moves forward without the matching verification on the current content. */
function requireEvidence(id, to) {
  const feature = readJson(join(project, "progress.json"))?.features?.find((candidate) => candidate.id === id);
  const from = feature?.cycle_step;
  const needed = EVIDENCE_FOR_MOVE[`${from} ${to}`];
  if (needed === undefined) return;
  const checkpoint = checkpointOf(id);
  if (checkpoint?.step === needed) {
    const changed = changedSinceVerified(checkpoint);
    if (changed.length === 0) return;
    block(`${id}: what \`${VERIFY_FOR_STEP[needed]}\` verified has changed since (${changed.join(", ")}): run it again before moving from ${from} to ${to}.`);
  }
  block(`${id} is in ${from}: run \`${VERIFY_FOR_STEP[needed]}\` and get it to pass for ${id} before moving to ${to}.`);
}

/** Blocks `oid progress step <id> quality_gate` from a subagent while the feature is at bdd_red: that exit after a revise is the orchestrating session's (ADR-041, ADR-046). */
function requireMainSessionForReviseExit(input, id, to) {
  const feature = readJson(join(project, "progress.json"))?.features?.find((candidate) => candidate.id === id);
  if (input.agent_id !== undefined && feature?.cycle_step === "bdd_red" && to === "quality_gate") {
    block(`\`oid progress step ${id} quality_gate\` from bdd_red ends a revise that needs no code and is made by the orchestrating session, not by a subagent (ADR-046): stop and report to it.`);
  }
}

function beforeStep(input) {
  for (const { args, assignments } of oidCommands(input.tool_input?.command ?? "")) {
    if (args.includes("--help") || args.includes("-h")) continue;
    const [command, subcommand, id, to] = args;
    if (command === "progress" && subcommand === "revise") {
      block("`oid progress revise` resets a requirement and is run by the human in their own terminal, not by the agent. For review comments on a done feature, use `oid progress reopen`.");
    }
    if (OVERRIDE in assignments && overridden(input, args, assignments[OVERRIDE])) continue;
    if (command === "verify" && (subcommand === "red" || subcommand === "green")) {
      requireIntegrity("since the last verification; fix it before verifying again, or the new checkpoint would absorb it");
    }
    if (command === "progress" && subcommand === "step" && id !== undefined && to !== undefined) {
      requireMainSessionForReviseExit(input, id, to);
      requireEvidence(id, to);
    }
  }
}

/** Whether the main session overrides this command (ADR-045): only `oid verify` and `oid progress step`, with a cause, recorded in .outside-in/overrides.ndjson. A subagent, which Claude Code marks with `agent_id`, is refused. */
function overridden(input, args, cause) {
  if (args[0] !== "verify" && !(args[0] === "progress" && args[1] === "step")) return false;
  if (input.agent_id !== undefined) block(`${OVERRIDE} is only for the orchestrating session (ADR-045): a subagent with no legal move stops and reports to it.`);
  if (cause.trim() === "") block(`${OVERRIDE} needs the cause of the override (ADR-045): ${OVERRIDE}="<cause>" oid ...`);
  try {
    mkdirSync(join(project, ".outside-in"), { recursive: true });
    appendFileSync(join(project, ".outside-in", "overrides.ndjson"), `${JSON.stringify({ date: new Date().toISOString(), command: ["oid", ...args].join(" "), cause })}\n`);
  } catch (error) {
    block(`${OVERRIDE}: the override could not be recorded in .outside-in/overrides.ndjson (${error.message}), so it is refused (ADR-045).`);
  }
  return true;
}

/** Blocks an edit of a file the step of the focused feature does not allow, with oid's own line. Fails open on anything else: after-edit still judges the change afterwards. */
function beforeEdit(input) {
  const file = input.tool_input?.file_path;
  if (typeof file !== "string" || file === "") return;
  const run = spawnSync("oid", ["verify", "integrity", "--path", file], { cwd: project, encoding: "utf8" });
  if (run.status === 1) block(`${run.stdout}${run.stderr}`.trim());
}

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
if (process.argv[2] === "after-edit") afterEdit();
else if (process.argv[2] === "before-step") beforeStep(input);
else if (process.argv[2] === "before-edit") beforeEdit(input);
