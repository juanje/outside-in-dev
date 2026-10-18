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
//                It also refuses, in every session (ADR-055), a Bash command that writes into src/, tests/ or
//                features/ (relative, with ./, or absolute inside the project): a redirection, tee, sed -i, perl -i,
//                cp or mv to it, patch or git apply whose diff has a `+++` header in it, inline python or node
//                code (or a heredoc) that names such a path and writes, an undo through git (checkout,
//                restore, stash, reset --hard, clean), and a script run with an
//                interpreter that is not versioned (tracked by git and unchanged from HEAD): its content is read
//                and judged like inline code. Relative paths resolve against the `cwd` of the tool call, moved by
//                the `cd`s of the line (a `cd` it cannot follow makes what follows fail open). The next action
//                is Edit or Write; there is no override. It fails open: a command it cannot analyse, a
//                script it cannot read, or one it does not know is let through.
//   before-edit  (PreToolUse on Edit|Write|MultiEdit): run `oid verify integrity --path <file>` on the file about
//                to be changed and block the edit when oid refuses it (exit 1), passing oid's line on, which
//                names the step to move to. It judges the path by its kind only: approved scenarios (ADR-040)
//                and forbidden patterns are still judged by after-edit, on the content. Writes from Bash to
//                src/, tests/ and features/ do not go through it: before-step refuses them. It fails open: if
//                oid is missing or fails in any other way, or the input has no file_path, the edit is allowed.
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
import { isAbsolute, join, relative, resolve, sep } from "node:path";

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

/** An empty simple command: its `words`, the targets of its unquoted `>` redirections in `redirects`, and the bodies of its heredocs in `body`. */
const freshCommand = () => Object.assign([], { redirects: [], body: "" });

/** The simple commands a shell line runs, each as its words: quoted strings are words, redirection targets and heredoc bodies are kept apart (`redirects`, `body`), and comments are left out. */
function commandsOf(text) {
  const commands = [];
  let words = freshCommand();
  let word = null;
  let redirect = null;
  const heredocs = [];
  const endWord = () => {
    if (word !== null && redirect === null) words.push(word);
    else if (word !== null) {
      if (redirect === "file") words.redirects.push(word);
      redirect = null;
    }
    word = null;
  };
  const endCommand = () => {
    endWord();
    redirect = null;
    if (words.length > 0 || words.redirects.length > 0 || words.body !== "") commands.push(words);
    words = freshCommand();
  };
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === "\n") {
      endCommand();
      for (const { delimiter, tabs, owner } of heredocs.splice(0)) {
        while (at < text.length) {
          const next = text.indexOf("\n", at + 1);
          const line = text.slice(at + 1, next < 0 ? text.length : next);
          at = next < 0 ? text.length : next;
          if ((tabs ? line.replace(/^\t+/, "") : line) === delimiter) break;
          owner.body += `${line}\n`;
        }
      }
    } else if (char === " " || char === "\t") endWord();
    else if (char === ">") {
      if (word !== null && /^\d+$/.test(word)) word = null;
      endWord();
      let next = at + 1;
      if (text[next] === ">") next++;
      if (text[next] === "&") redirect = "descriptor";
      else redirect = "file";
      if (text[next] === "&" || text[next] === "|") next++;
      at = next - 1;
    } else if (char === "&" && text[at + 1] === ">") endWord();
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
      heredocs.push({ delimiter, tabs, owner: words });
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

/** The directories whose files are written with Edit or Write only (ADR-055): a write from Bash does not go through before-edit and after-edit. */
const PROTECTED_DIRS = ["src", "tests", "features"];
const USE_EDIT = "use Edit or Write for files under src/, tests/ and features/";
const USE_EDIT_TO_UNDO = "to undo a change, use Edit (git cannot be used to discard work under src/, tests/ and features/)";
const EVIDENCE_LENGTH = 200;
const MAX_DEPTH = 3;
const INTERPRETERS = { python: /^python[\d.]*$/, node: /^(node|nodejs|bun|deno|tsx|ts-node)$/, shell: /^(bash|sh|zsh|dash)$/ };
const INLINE_FLAG = { python: /^-[a-zA-Z]*c$/, node: /^(-e|--eval|-p|--print)$/, shell: /^-[a-zA-Z]*c$/ };
/** What inline code does to write a file: open() with a writing mode, or a call that writes, appends, renames or copies. */
const CODE_WRITES = /\bopen\s*\([^)]*?(['"])[rwxabt+]*[wax+][rwxabt+]*\1|write_text|write_bytes|writeFile|appendFile|createWriteStream|rename|copyFile|shutil\.(copy|move)|os\.replace/;

/** The directory relative paths of the command being judged resolve against: the `cwd` of the tool call, moved by the `cd`s of the line; undefined when a `cd` cannot be followed (what follows then fails open). */
let base = project;

/** The absolute path `raw` names, or undefined when it is relative and the directory is unknown. */
function absolute(raw) {
  const path = raw.replaceAll("${CLAUDE_PROJECT_DIR}", project).replaceAll("$CLAUDE_PROJECT_DIR", project);
  if (isAbsolute(path)) return resolve(path);
  return base === undefined ? undefined : resolve(base, path);
}

/** The path `raw` names relative to the project, or undefined when it is outside it (or unknown). */
function inProject(raw) {
  const path = absolute(raw);
  if (path === undefined) return undefined;
  const rel = relative(project, path);
  return rel.startsWith("..") || isAbsolute(rel) ? undefined : rel;
}
const isProtected = (raw) => PROTECTED_DIRS.includes((inProject(raw) ?? "").split(sep)[0]);
/** Whether a git path argument covers a protected directory: the project root does too. */
const coversProtected = (raw) => inProject(raw) === "" || isProtected(raw);

/** Whether `code` names a protected path and writes. */
function codeWrites(code) {
  const text = code.replaceAll(project + "/", "").replaceAll("${CLAUDE_PROJECT_DIR}/", "").replaceAll("$CLAUDE_PROJECT_DIR/", "");
  return /(?:^|[^\w./-])(?:\.\/)?(?:src|tests|features)(?:\/|['"]|$)/m.test(text) && CODE_WRITES.test(text);
}

/** Whether a script is versioned: tracked by git and unchanged from HEAD. */
function versioned(path) {
  const rel = inProject(path);
  if (rel === undefined || rel === "") return false;
  const ok = (args) => spawnSync("git", args, { cwd: project }).status === 0;
  return ok(["ls-files", "--error-unmatch", "--", rel]) && ok(["diff", "--quiet", "HEAD", "--", rel]);
}

/** The text of a file, or undefined when it cannot be read. */
function textOf(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

const PATCH_NO_WRITE = ["--check", "--stat", "--numstat", "--dry-run"];
const USE_EDIT_FOR_PATCH = "use Edit; for a mutant, apply it with Edit and undo it with Edit (docs/METHODOLOGY.md)";

/** What `patch` or `git apply` writes in a protected directory, from the `+++` headers of the diff it is given (a file, `<` or a heredoc), or undefined. A diff that cannot be read is let through. */
function patchWrite(args, words, program) {
  if (args.some((arg) => PATCH_NO_WRITE.includes(arg))) return undefined;
  const input = args.findIndex((arg) => arg === "-i" || arg.startsWith("--input="));
  const redirect = words.findIndex((word) => word.startsWith("<"));
  let file;
  if (input >= 0) file = args[input].includes("=") ? args[input].split("=")[1] : args[input + 1];
  else if (redirect >= 0) file = words[redirect].length > 1 ? words[redirect].slice(1) : words[redirect + 1];
  else if (program === "git") file = args.find((arg) => !arg.startsWith("-"));
  const diff = words.body !== "" ? words.body : file === undefined || absolute(file) === undefined ? undefined : textOf(absolute(file));
  if (diff === undefined) return undefined;
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+++ ")) continue;
    const path = line.slice(4).split("\t")[0].trim();
    const stripped = path.split("/").slice(1).join("/");
    if (path !== "/dev/null" && (isProtected(path) || isProtected(stripped))) return `a patch writes to ${path} (${program === "git" ? "git apply" : "patch"})`;
  }
  return undefined;
}

/** The first argument that is not an option: the script an interpreter runs. */
const scriptOf = (args) => args.find((arg) => arg !== "-" && !arg.startsWith("-"));

/** What a git command does to a protected directory, or undefined: the undo commands. */
function gitWrite(args, words) {
  let at = 0;
  while (at < args.length && args[at].startsWith("-")) at += args[at] === "-C" || args[at] === "-c" ? 2 : 1;
  const [subcommand, ...rest] = args.slice(at);
  const operands = rest.filter((arg) => !arg.startsWith("-"));
  if (subcommand === "apply") return patchWrite(rest, words, "git");
  if (subcommand === "stash") return operands[0] === "list" || operands[0] === "show" ? undefined : "git stash saves and removes the changes of src/, tests/ and features/";
  if (subcommand === "reset") return rest.includes("--hard") ? "git reset --hard discards the changes of src/, tests/ and features/" : undefined;
  if (subcommand === "clean") return rest.includes("-n") || rest.includes("--dry-run") ? undefined : operands.length === 0 || operands.some(coversProtected) ? "git clean deletes files of src/, tests/ and features/" : undefined;
  if (subcommand === "restore" && (rest.includes("--staged") || rest.includes("-S")) && !rest.includes("--worktree") && !rest.includes("-W")) return undefined;
  if ((subcommand === "checkout" || subcommand === "restore") && operands.some(coversProtected)) return `git ${subcommand} overwrites files of src/, tests/ and features/`;
  return undefined;
}

/** The destination of a cp or mv: the `-t` directory, or the last operand when there are two or more. */
function destinationOf(args) {
  const target = args.findIndex((arg) => arg === "-t" || arg.startsWith("--target-directory"));
  if (target >= 0) return args[target].includes("=") ? args[target].split("=")[1] : args[target + 1];
  const operands = args.filter((arg) => !arg.startsWith("-"));
  return operands.length >= 2 ? operands.at(-1) : undefined;
}

/** What an interpreter run does to a protected path (inline code, a heredoc, a script file that is not versioned), or undefined. */
function interpreterWrite(kind, args, body, depth) {
  const flag = args.findIndex((arg) => INLINE_FLAG[kind].test(arg));
  const script = flag < 0 ? scriptOf(args) : undefined;
  if ((kind === "python" && args.includes("-m")) || (kind === "node" && (args.includes("--check") || args.includes("-c")))) return undefined;
  let code = body;
  if (flag >= 0) code = args.slice(flag + 1).join(" ");
  else if (script !== undefined) {
    const path = absolute(script);
    if (path === undefined || (inProject(path) ?? "").split(sep)[0] === "node_modules" || versioned(path)) return undefined;
    code = textOf(path);
    if (code === undefined) return undefined;
  }
  if (kind === "shell" && depth < MAX_DEPTH && bashWrite(code, depth + 1) !== undefined) return "a shell script writes to src/, tests/ or features/";
  return codeWrites(code) ? "code run by an interpreter names src/, tests/ or features/ and writes" : undefined;
}

/** What one simple command writes in a protected directory, or undefined. */
function commandWrite(words, depth) {
  const redirected = words.redirects.find(isProtected);
  if (redirected !== undefined) return `a redirection writes to ${redirected}`;
  let at = 0;
  while (at < words.length && (ASSIGNMENT.test(words[at]) || WRAPPERS.has(words[at]))) at++;
  const program = (words[at] ?? "").split("/").pop();
  const args = words.slice(at + 1);
  const operands = args.filter((arg) => !arg.startsWith("-"));
  if (program === "cd") {
    const target = operands[0];
    base = target === undefined || target.startsWith("~") || (target.includes("$") && !target.includes("CLAUDE_PROJECT_DIR")) ? undefined : absolute(target);
    return undefined;
  }
  if (program === "tee" && operands.some(isProtected)) return "tee writes to a protected path";
  if ((program === "sed" || program === "perl") && args.some((arg) => /^-[a-zA-Z]*i|^--in-place/.test(arg)) && operands.some(isProtected)) return `${program} edits a protected file in place`;
  if (program === "cp" || program === "mv" || (program === "git" && args.includes("mv"))) {
    const destination = destinationOf(args);
    if (destination !== undefined && isProtected(destination)) return `${program} writes to ${destination}`;
  }
  if (program === "patch") return patchWrite(args, words, "patch");
  if (program === "git") return gitWrite(args, words);
  for (const [kind, pattern] of Object.entries(INTERPRETERS)) {
    if (pattern.test(program)) return interpreterWrite(kind, args, words.body, depth);
  }
  return undefined;
}

/** What a line of shell writes in src/, tests/ or features/, as `{ what, evidence, next }`, or undefined. */
function bashWrite(text, depth = 0) {
  const start = base;
  try {
    for (const words of commandsOf(text)) {
      const what = commandWrite(words, depth);
      if (what === undefined) continue;
      const evidence = [...words, ...words.redirects.map((target) => `> ${target}`)].join(" ").slice(0, EVIDENCE_LENGTH);
      let next = USE_EDIT;
      if (what.startsWith("git ")) next = USE_EDIT_TO_UNDO;
      else if (what.startsWith("a patch ")) next = USE_EDIT_FOR_PATCH;
      return { what, evidence, next };
    }
    return undefined;
  } finally {
    base = start;
  }
}

/** Blocks a Bash command that writes in src/, tests/ or features/, in every session (ADR-055). It fails open: if the analysis throws, the command passes. */
function requireEditForProtected(command, cwd) {
  let found;
  try {
    base = typeof cwd === "string" && isAbsolute(cwd) ? cwd : project;
    found = bashWrite(command);
  } catch {
    return;
  }
  if (found !== undefined) block(`Refused: ${found.what}.\nEvidence: ${found.evidence}\nNext: ${found.next}.`);
}

function beforeStep(input) {
  requireEditForProtected(input.tool_input?.command ?? "", input.cwd);
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
