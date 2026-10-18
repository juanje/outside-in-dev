import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordCheckpoint } from "../../src/artifacts/checkpoint.js";
import { commitAll } from "./git-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const HOOK = join(import.meta.dirname, "..", "..", "scripts", "claude-hook.mjs");
const GREEN = { step: "tdd_green", feature: "FR-X-01", verify: { kind: "green", target: "all" }, external: false, date: new Date(0) };
const STEP_TO_REFACTOR = { tool_input: { command: "oid progress step FR-X-01 refactor" } };

/** Runs the hook in the temporary project with `input` on stdin: its exit code and what it printed on stderr. */
function runHook(mode: string, input: unknown): { status: number | null; stderr: string } {
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync(process.execPath, [HOOK, mode], { input: JSON.stringify(input), env: { ...env, CLAUDE_PROJECT_DIR: dir }, encoding: "utf8" });
  return { status: run.status, stderr: run.stderr };
}

/** A project whose feature FR-X-01 is in tdd_green, with a Green verified on a change to its source, recorded in the single checkpoint that names the feature, as oid v0.6 writes it. */
function verifiedGreen(): void {
  write("src/a.ts", "export const a = 1;\n");
  write("progress.json", JSON.stringify({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "X", status: "in_progress", cycle_step: "tdd_green", scenarios: [] }] }));
  commitAll();
  write("src/a.ts", "export const a = 2;\n");
  recordCheckpoint(dir, { ...GREEN, feature: null });
  const single = join(dir, ".outside-in", "checkpoint.json");
  writeFileSync(single, JSON.stringify({ ...JSON.parse(readFileSync(single, "utf8")), feature: GREEN.feature }));
}

describe("the before-step hook", () => {
  it("refuses to leave a step when the code changed after its verification passed", () => {
    verifiedGreen();
    write("src/a.ts", "export const a = 3;\n");
    const { status, stderr } = runHook("before-step", STEP_TO_REFACTOR);
    expect({ status, names: stderr.includes("src/a.ts") }).toEqual({ status: 2, names: true });
  });

  it("lets the step go when nothing but the progress file changed since the verification", () => {
    verifiedGreen();
    write("progress.json", JSON.stringify({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "X", status: "in_progress", cycle_step: "tdd_green", scenarios: [{ name: "s", bdd: "pass" }] }] }));
    expect(runHook("before-step", STEP_TO_REFACTOR).status).toBe(0);
  });

  it("checks the integrity of the change before a new verification replaces the checkpoint, and refuses it when integrity fails", () => {
    verifiedGreen();
    write("bin/oid", '#!/bin/sh\nif [ "$1 $2" = "verify integrity" ]; then echo "tests/unit/a.test.ts changed a test while writing code"; exit 1; fi\nexit 0\n');
    spawnSync("chmod", ["+x", join(dir, "bin", "oid")]);
    const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
    const run = spawnSync(process.execPath, [HOOK, "before-step"], {
      input: JSON.stringify({ tool_input: { command: "oid verify green" } }),
      env: { ...env, CLAUDE_PROJECT_DIR: dir, PATH: `${join(dir, "bin")}:${env.PATH}` },
      encoding: "utf8",
    });
    expect({ status: run.status, reported: run.stderr.includes("changed a test while writing code") }).toEqual({ status: 2, reported: true });
  });
});

/** A committed project whose feature FR-X-01 is focused at `step`, with no verification recorded. */
function focusedAt(step: string): void {
  write("src/a.ts", "export const a = 1;\n");
  write("progress.json", JSON.stringify({ current_focus: "FR-X-01", features: [{ id: "FR-X-01", title: "X", status: "in_progress", cycle_step: step, scenarios: [] }] }));
  commitAll();
}

/** Runs the before-step hook on `command` with an `oid` whose integrity check always fails: its exit code. */
function beforeStepWithFailingIntegrity(command: string): number | null {
  write("bin/oid", '#!/bin/sh\nif [ "$1 $2" = "verify integrity" ]; then echo "src/a.ts changed source code while writing tests"; exit 1; fi\nexit 0\n');
  spawnSync("chmod", ["+x", join(dir, "bin", "oid")]);
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync(process.execPath, [HOOK, "before-step"], {
    input: JSON.stringify({ tool_input: { command } }),
    env: { ...env, CLAUDE_PROJECT_DIR: dir, PATH: `${join(dir, "bin")}:${env.PATH}` },
    encoding: "utf8",
  });
  return run.status;
}

describe("the before-step hook, by direction of the move", () => {
  it("lets a feature go back to a Red without a verification", () => {
    focusedAt("tdd_green");
    const back = ["oid progress step FR-X-01 tdd_red", "oid progress step FR-X-01 bdd_red"].map((command) => runHook("before-step", { tool_input: { command } }).status);
    expect(back).toEqual([0, 0]);
  });

  it("requires a green to move forward from refactor to quality_gate", () => {
    focusedAt("refactor");
    const { status, stderr } = runHook("before-step", { tool_input: { command: "oid progress step FR-X-01 quality_gate" } });
    expect({ status, names: stderr.includes("oid verify green") }).toEqual({ status: 2, names: true });
  });
});

describe("the before-step hook, with a checkpoint per feature", () => {
  it("reads the checkpoint of the feature, not the single checkpoint of another one", () => {
    focusedAt("tdd_green");
    write("src/a.ts", "export const a = 2;\n");
    recordCheckpoint(dir, GREEN);
    recordCheckpoint(dir, { ...GREEN, step: "tdd_red", feature: null });
    expect(runHook("before-step", STEP_TO_REFACTOR).status).toBe(0);
  });
});

describe("the before-step hook, on the command it is given", () => {
  it("takes no text in a heredoc, a comment or a quoted string for a command", () => {
    focusedAt("tdd_green");
    const texts = [
      "cat <<'EOF'\noid verify green\noid progress step FR-X-01 refactor\nEOF",
      'git commit -m "$(cat <<\'EOF\'\nrun oid verify green before oid progress step FR-X-01 refactor\nEOF\n)"',
      "echo 'oid verify green' \"oid progress step FR-X-01 refactor\"",
      "ls # oid verify green; oid progress step FR-X-01 refactor",
    ];
    expect(texts.map(beforeStepWithFailingIntegrity)).toEqual([0, 0, 0, 0]);
  });

  it("recognises the command wherever it runs in the line: after a cd, a pipe or a wrapper", () => {
    focusedAt("tdd_green");
    const commands = ["cd /tmp && oid verify green", "true | rtk proxy oid verify red x.feature:3", "NODE_OPTIONS= oid verify green"];
    expect(commands.map(beforeStepWithFailingIntegrity)).toEqual([2, 2, 2]);
  });
});

describe("the before-step hook, on revise and reopen", () => {
  it("refuses oid progress revise run by the agent, and names the human's terminal", () => {
    focusedAt("tdd_green");
    const { status, stderr } = runHook("before-step", { tool_input: { command: "cd /tmp && oid progress revise FR-X-01" } });
    expect({ status, names: stderr.includes("human in their own terminal") }).toEqual({ status: 2, names: true });
  });

  it("takes oid progress revise in a comment or a heredoc for text, and lets oid progress reopen run", () => {
    focusedAt("tdd_green");
    const commands = ["ls # oid progress revise FR-X-01", "cat <<'EOF'\noid progress revise FR-X-01\nEOF", "oid progress reopen FR-X-01"];
    expect(commands.map((command) => runHook("before-step", { tool_input: { command } }).status)).toEqual([0, 0, 0]);
  });

  it("refuses oid progress step quality_gate from bdd_red, the exit after a revise, from a subagent, and names the orchestrating session", () => {
    focusedAt("bdd_red");
    const { status, stderr } = runHook("before-step", { tool_input: { command: "oid progress step FR-X-01 quality_gate" }, agent_id: "a1" });
    expect({ status, names: stderr.includes("orchestrating session") }).toEqual({ status: 2, names: true });
  });

  it("lets the main session make the exit from bdd_red to quality_gate with no override, and records nothing (ADR-046)", () => {
    focusedAt("bdd_red");
    expect(runHook("before-step", { tool_input: { command: "oid progress step FR-X-01 quality_gate" } }).status).toBe(0);
    expect(existsSync(join(dir, ".outside-in", "overrides.ndjson"))).toBe(false);
  });
});

describe("the before-step hook, on --help", () => {
  it("lets oid --help or -h through without the integrity or evidence checks, because nothing runs", () => {
    focusedAt("tdd_green");
    const commands = ["oid verify green --help", "oid verify red -h", "oid progress step FR-X-01 refactor --help"];
    expect(commands.map(beforeStepWithFailingIntegrity)).toEqual([0, 0, 0]);
  });

  it("lets oid progress revise --help and the human-only exit from bdd_red through too, because with --help nothing runs", () => {
    focusedAt("bdd_red");
    const commands = ["oid progress revise --help", "oid progress step FR-X-01 quality_gate -h"];
    expect(commands.map((command) => runHook("before-step", { tool_input: { command } }).status)).toEqual([0, 0]);
  });
});

/** Runs the before-edit hook on an edit of `file_path` with a fake `oid` (the script `oidScript`): its exit code and stderr. */
function beforeEditWith(oidScript: string, toolInput: unknown = { file_path: "src/a.ts" }): { status: number | null; stderr: string } {
  write("bin/oid", oidScript);
  spawnSync("chmod", ["+x", join(dir, "bin", "oid")]);
  const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...env } = process.env;
  const run = spawnSync(process.execPath, [HOOK, "before-edit"], {
    input: JSON.stringify({ tool_input: toolInput }),
    env: { ...env, CLAUDE_PROJECT_DIR: dir, PATH: `${join(dir, "bin")}:${env.PATH}` },
    encoding: "utf8",
  });
  return { status: run.status, stderr: run.stderr };
}

const REFUSING_OID = '#!/bin/sh\nif [ "$1 $2 $3" = "verify integrity --path" ]; then echo "$4 is source code: move to tdd_green to change it"; exit 1; fi\nexit 0\n';

describe("the before-edit hook", () => {
  it("blocks the edit with oid's line when oid verify integrity --path refuses the file", () => {
    const { status, stderr } = beforeEditWith(REFUSING_OID);
    expect({ status, reason: stderr.includes("src/a.ts is source code: move to tdd_green to change it") }).toEqual({ status: 2, reason: true });
  });

  it("allows the edit when oid says the path is allowed", () => {
    expect(beforeEditWith("#!/bin/sh\necho 'integrity: ok'\nexit 0\n").status).toBe(0);
  });

  it("allows the edit when oid fails in any other way, because after-edit still judges the change", () => {
    expect(beforeEditWith("#!/bin/sh\necho boom >&2\nexit 3\n").status).toBe(0);
  });

  it("allows the edit when the tool input names no file, without asking oid", () => {
    expect(beforeEditWith(REFUSING_OID, {}).status).toBe(0);
  });
});

describe("the before-step hook, on overrides by the orchestrating session (ADR-045)", () => {
  const overrides = (): unknown[] => readFileSync(join(dir, ".outside-in", "overrides.ndjson"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const OVERRIDDEN_STEP = { tool_input: { command: 'OID_OVERRIDE="the unit test was fixed by the orchestrator" oid progress step FR-X-01 refactor' } };

  it("lets the main session make a refused move with OID_OVERRIDE and records the cause", () => {
    verifiedGreen();
    write("src/a.ts", "export const a = 3;\n");
    expect(runHook("before-step", OVERRIDDEN_STEP).status).toBe(0);
    expect(overrides()).toEqual([{ date: expect.any(String), command: "oid progress step FR-X-01 refactor", cause: "the unit test was fixed by the orchestrator" }]);
  });

  it("refuses an override from a subagent, naming ADR-045, and records nothing", () => {
    verifiedGreen();
    write("src/a.ts", "export const a = 3;\n");
    const { status, stderr } = runHook("before-step", { ...OVERRIDDEN_STEP, agent_id: "a1", agent_type: "general-purpose" });
    expect({ status, names: stderr.includes("ADR-045"), recorded: existsSync(join(dir, ".outside-in", "overrides.ndjson")) }).toEqual({ status: 2, names: true, recorded: false });
  });

  it("refuses an override that cannot be recorded, so that no override goes unrecorded", () => {
    verifiedGreen();
    write("src/a.ts", "export const a = 3;\n");
    mkdirSync(join(dir, ".outside-in", "overrides.ndjson"), { recursive: true });
    const { status, stderr } = runHook("before-step", OVERRIDDEN_STEP);
    expect({ status, says: stderr.includes("could not be recorded") }).toEqual({ status: 2, says: true });
  });

  it("refuses an override with no cause", () => {
    verifiedGreen();
    write("src/a.ts", "export const a = 3;\n");
    const { status, stderr } = runHook("before-step", { tool_input: { command: "OID_OVERRIDE= oid progress step FR-X-01 refactor" } });
    expect({ status, asks: stderr.includes("needs the cause") }).toEqual({ status: 2, asks: true });
  });

  it("still refuses oid progress revise with an override", () => {
    const { status, stderr } = runHook("before-step", { tool_input: { command: 'OID_OVERRIDE="cause" oid progress revise FR-X-01' } });
    expect({ status, human: stderr.includes("run by the human") }).toEqual({ status: 2, human: true });
  });

  it("frees only the command that carries the override in a line with two oid commands", () => {
    verifiedGreen();
    write("src/a.ts", "export const a = 3;\n");
    const { status, stderr } = runHook("before-step", { tool_input: { command: 'OID_OVERRIDE="cause" oid progress reopen FR-X-01 && oid progress step FR-X-01 refactor' } });
    expect({ status, names: stderr.includes("src/a.ts") }).toEqual({ status: 2, names: true });
  });
});

/** The exit code of the before-step hook for each of `commands`, run in the temporary project. */
const statusesOf = (commands: string[]): (number | null)[] => commands.map((command) => runHook("before-step", { tool_input: { command } }).status);

describe("the before-step hook, on Bash writes to the project's files (ADR-055)", () => {
  it("refuses a redirection to a protected path, relative, with ./ or absolute, and says what to use instead", () => {
    focusedAt("tdd_green");
    const commands = ["echo x > src/a.ts", "echo x >> src/a.ts", "echo x >src/a.ts", "echo x 2> tests/e.txt", "echo x &> features/x.log", "cat <<EOF > features/x.feature\nFeature: x\nEOF", "echo x > ./src/a.ts", `echo x > ${dir}/src/a.ts`, 'echo x > "$CLAUDE_PROJECT_DIR/tests/a.ts"'];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
    const { stderr } = runHook("before-step", { tool_input: { command: "echo x > src/a.ts" } });
    expect({ what: stderr.includes("src/a.ts"), next: stderr.includes("use Edit or Write for the project's files; Bash writes only to dist/, node_modules/, coverage/, outside the project, or through a versioned script; .outside-in/ is written only by oid") }).toEqual({ what: true, next: true });
  });

  it("refuses tee to a protected path", () => {
    focusedAt("tdd_green");
    expect(statusesOf(["echo x | tee src/a.ts", "echo x | tee -a tests/x"])).toEqual([2, 2]);
  });

  it("refuses an in-place edit of a protected path with sed or perl", () => {
    focusedAt("tdd_green");
    const commands = ["sed -i 's/a/b/' src/a.ts", "sed -i.bak 's/a/b/' src/a.ts", "sed --in-place 's/a/b/' tests/a.test.ts", "perl -pi -e 's/a/b/' features/x.feature"];
    expect(statusesOf(commands)).toEqual([2, 2, 2, 2]);
  });

  it("refuses cp and mv whose destination is protected", () => {
    focusedAt("tdd_green");
    expect(statusesOf(["cp x src/a.ts", "cp -r d features/", "mv /tmp/x src/a.ts", "cp -t src/ x"])).toEqual([2, 2, 2, 2]);
  });

  it("refuses inline python or node code that names a protected path and writes", () => {
    focusedAt("tdd_green");
    const commands = [
      `python3 -c "open('src/a.ts','w').write('x')"`,
      `python3 -c "open('src/a.ts', mode='a').write('x')"`,
      `python3 -c "from pathlib import Path; Path('tests/a.ts').write_text('x')"`,
      `node -e "require('fs').writeFileSync('src/a.ts','x')"`,
      `node --eval "require('fs').appendFileSync('features/x.feature','x')"`,
      `node -e "require('fs').renameSync('a','src/b.ts')"`,
      "python3 - <<EOF\nopen('src/a.ts', 'w').write('x')\nEOF",
      "node <<EOF\nrequire('fs').writeFileSync('./tests/a.ts','x')\nEOF",
    ];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
  });

  it("refuses inline code that reads a file of the project and writes outside it, and says to print and redirect instead", () => {
    focusedAt("tdd_green");
    const { status, stderr } = runHook("before-step", { tool_input: { command: `python3 -c "d = open('src/a.ts').read(); open('/tmp/o.md', 'w').write(d)"` } });
    expect({ status, next: stderr.includes(`Next: have the code only read and print, and redirect its output outside the project (python3 -c "…print(…)…" > /tmp/x); to change a file of the project, use Edit or Write.`) }).toEqual({ status: 2, next: true });
  });

  it("refuses the same writes inside a compound line", () => {
    focusedAt("tdd_green");
    const commands = ["cd docs && echo x > ../src/a.ts", "ls; sed -i 's/a/b/' src/a.ts", "cat x | tee src/a.ts", "true && cp x src/a.ts", `bash -c "echo x > src/a.ts"`];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
  });

  it("refuses to undo a change through git, and says to use Edit", () => {
    focusedAt("tdd_green");
    const commands = ["git checkout -- src/a.ts", "git checkout .", "git checkout HEAD -- tests", "git restore src/a.ts", "git restore --source=HEAD features/", "git stash", "git stash push -- src", "git stash pop", "git reset --hard", "git reset --hard HEAD~1", "git clean -fd src/", "git clean -fd", "git -C . stash"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
    const { stderr } = runHook("before-step", { tool_input: { command: "git checkout -- src/a.ts" } });
    expect(stderr.includes("to undo a change, use Edit")).toBe(true);
  });

  it("lets reads through: cat, grep, sed -n, head, wc, git diff and git show on src/", () => {
    focusedAt("tdd_green");
    const commands = ["cat src/a.ts", "grep -rn export src/ tests/", "sed -n 1,10p src/a.ts", "head -5 src/a.ts", "wc -l src/a.ts", "git diff -- src/a.ts", "git show HEAD:src/a.ts", 'grep -n ">" src/a.ts', "ls features/ 2>&1"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("lets writes outside the project through", () => {
    focusedAt("tdd_green");
    const commands = ["echo x >> /tmp/y", `echo x > ${tmpdir()}/x`, "echo x > /dev/null", "ls nothing 2>&1", "echo x | tee /tmp/run.log", "echo x > ~/.cache/x", "echo x > $SOMEWHERE/x"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("lets a protected source be copied to an unprotected destination", () => {
    focusedAt("tdd_green");
    expect(statusesOf(["cp src/a.ts /tmp/x", "cp -r src /tmp/copy", "mv src/a.ts /tmp/x"])).toEqual([0, 0, 0]);
  });

  it("lets inline code that only reads through", () => {
    focusedAt("tdd_green");
    const commands = [`python3 -c "print(open('src/a.ts').read())"`, `node -e "console.log(require('fs').readFileSync('src/a.ts','utf8'))"`, "python3 - <<EOF\nprint(open('src/a.ts').read())\nEOF", `python3 -c "open('/tmp/o.md','w').write('x')"`];
    expect(statusesOf(commands)).toEqual([0, 0, 0, 0]);
  });

  it("takes text inside quotes or in the heredoc body of a command that is not an interpreter for text", () => {
    focusedAt("tdd_green");
    const commands = ['git commit -m "echo > src/x"', "git commit -F - <<EOF\nsed -i s/a/b/ src/a.ts\necho x > src/a.ts\nEOF", "echo 'sed -i s/a/b/ src/a.ts'", "cat <<'EOF'\ngit stash\nEOF", "ls # echo x > src/a.ts"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("lets the project tools, rm and git rm through", () => {
    focusedAt("tdd_green");
    const commands = ["npm run test:unit", "npx vitest run tests/unit/a.test.ts", "npx cucumber-js features/a.feature", "oid check", "git add src/a.ts", "git commit -m x", "rm src/a.ts", "git rm src/a.ts", "make build", "some-unknown-binary src/a.ts", "git checkout main", "git restore --staged src/a.ts", "git clean -n src/", "git stash list"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("runs a versioned script, tracked and unchanged, and refuses the same script modified or untracked when it writes into src/", () => {
    const writer = "import { writeFileSync } from 'node:fs';\nwriteFileSync('src/a.ts', 'x');\n";
    write("scripts/tracked.mjs", writer);
    focusedAt("tdd_green");
    write("scripts/untracked.mjs", writer);
    const tracked = statusesOf(["node scripts/tracked.mjs"]);
    write("scripts/tracked.mjs", `${writer}// changed\n`);
    const modified = statusesOf(["node scripts/tracked.mjs"]);
    expect({ tracked, modified, untracked: statusesOf(["node scripts/untracked.mjs", "node ./scripts/untracked.mjs"]) }).toEqual({ tracked: [0], modified: [2], untracked: [2, 2] });
  });

  it("reads a script that is not versioned: refuses one that writes into src/, lets through one that only reads or cannot be read", () => {
    focusedAt("tdd_green");
    const scripts = join(mkdtempSync(join(tmpdir(), "oid-scripts-")), "s");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(join(scripts, "writes.py"), "open('src/a.ts', 'w').write('x')\n");
    writeFileSync(join(scripts, "reads.py"), "print(open('src/a.ts').read())\n");
    writeFileSync(join(scripts, "writes.sh"), "sed -i 's/a/b/' src/a.ts\n");
    const statuses = statusesOf([`python3 ${join(scripts, "writes.py")}`, `python3 ${join(scripts, "reads.py")}`, `python3 ${join(scripts, "missing.py")}`, `bash ${join(scripts, "writes.sh")}`, `python3 ${scripts}`]);
    rmSync(join(scripts, ".."), { recursive: true, force: true });
    expect(statuses).toEqual([2, 0, 0, 2, 0]);
  });

  it("resolves relative paths against the cwd of the tool call, and follows a cd in the same line", () => {
    focusedAt("tdd_green");
    const at = (cwd: string, command: string): number | null => runHook("before-step", { cwd, tool_input: { command } }).status;
    const blocked = [at(join(dir, "src"), "echo x > a.ts"), at(dir, "cd src && echo x > a.ts"), at(join(dir, "docs"), "cd ../tests; sed -i s/a/b/ a.test.ts"), at(dir, "cd $CLAUDE_PROJECT_DIR/features && echo x > a.feature")];
    const allowed = [at(join(dir, "docs"), "echo x > /tmp/a.md"), at(dir, "cd /tmp && echo x > src/a.ts"), at(tmpdir(), "echo x > a.md"), at(join(dir, "src"), "cd /tmp && echo x > a.md")];
    const blockedNow = [at(join(dir, "docs"), "echo x > a.md"), at(dir, "cd docs && echo x > a.md"), at(join(dir, "src"), "cd .. && echo x > a.md")];
    expect({ blocked, allowed, blockedNow }).toEqual({ blocked: [2, 2, 2, 2], allowed: [0, 0, 0, 0], blockedNow: [2, 2, 2] });
  });

  it("lets what follows a cd it cannot follow through, and still refuses an absolute path", () => {
    focusedAt("tdd_green");
    const commands = ["cd && echo x > src/a.ts", "cd - && echo x > src/a.ts", "cd $SOMEWHERE && echo x > src/a.ts", `cd - && echo x > ${dir}/src/a.ts`];
    expect(statusesOf(commands)).toEqual([0, 0, 0, 2]);
  });

  it("refuses patch and git apply of a diff that writes into a protected path, and says to use Edit for a mutant", () => {
    focusedAt("tdd_green");
    write("m.diff", "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;\n");
    write("plain.diff", "--- tests/a.test.ts\n+++ tests/a.test.ts\t2026-01-01\n@@ -1 +1 @@\n-a\n+b\n");
    const commands = ["git apply m.diff", "patch -p1 -i m.diff", "patch -p1 < m.diff", "patch -p0 <plain.diff", "git apply --index plain.diff", "cd src && git apply ../m.diff", "patch -p1 <<EOF\n--- a/features/x.feature\n+++ b/features/x.feature\n@@ -1 +1 @@\n-a\n+b\nEOF"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
    const { stderr } = runHook("before-step", { tool_input: { command: "git apply m.diff" } });
    expect(stderr.includes("for a mutant, apply it with Edit and undo it with Edit (docs/METHODOLOGY.md)")).toBe(true);
  });

  it("lets patch and git apply through when they only check, or the diff is outside the protected paths or cannot be read", () => {
    focusedAt("tdd_green");
    write("m.diff", "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n");
    write("d.diff", "--- /tmp/a.md\n+++ /tmp/a.md\n@@ -1 +1 @@\n-a\n+b\n");
    const commands = ["git apply --check m.diff", "git apply --stat m.diff", "git apply --numstat m.diff", "patch --dry-run -p1 < m.diff", "git apply d.diff", "patch -p1 < d.diff", "git apply missing.diff", "git apply -", "patch -p1", "cat m.diff | git apply"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("refuses a write to any project file outside the generated directories", () => {
    focusedAt("tdd_green");
    write("docs/bootstrap-log.md", "row\n");
    write("m.diff", "--- a/docs/a.md\n+++ b/docs/a.md\n@@ -1 +1 @@\n-a\n+b\n");
    const commands = [
      "sed -i 's/a/b/' docs/bootstrap-log.md",
      "perl -pi -e 's/a/b/' docs/a.md",
      "echo x >> docs/a.md",
      "echo x > progress.json",
      "echo x > SPEC.md",
      "echo x > src-notes.txt",
      `echo x > ${dir}/docs/a.md`,
      "cd docs && echo x > a.md",
      "cat <<EOF > docs/x.md\nx\nEOF",
      "oid verify green | tee run.log",
      "cp /tmp/x docs/a.md",
      "cp docs/a.md docs/b.md",
      "mv /tmp/x docs/a.md",
      "git apply m.diff",
      "patch -p1 < m.diff",
    ];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
  });

  it("refuses inline code, and a script that is not versioned, that writes in the project", () => {
    focusedAt("tdd_green");
    const scripts = mkdtempSync(join(tmpdir(), "oid-scripts-"));
    writeFileSync(join(scripts, "s.mjs"), "import { writeFileSync } from 'node:fs';\nwriteFileSync('docs/a.md', 'x');\n");
    const commands = [
      `python3 -c "open('docs/a.md','w').write('x')"`,
      `python3 -c "open('out','w').write('x')"`,
      `node -e "require('fs').writeFileSync('./docs/a.md','x')"`,
      `node -e "require('fs').writeFileSync('${dir}/docs/a.md','x')"`,
      `node ${join(scripts, "s.mjs")}`,
    ];
    const statuses = statusesOf(commands);
    rmSync(scripts, { recursive: true, force: true });
    expect(statuses).toEqual(commands.map(() => 2));
  });

  it("refuses a write to .git/, .claude/ and .outside-in/, and says that .outside-in/ is written only by oid", () => {
    focusedAt("tdd_green");
    const commands = [
      "echo x >> .git/info/exclude",
      "echo x > .claude/settings.json",
      "echo '{}' > .outside-in/checkpoints/FR-X.json",
      "echo x >> .outside-in/overrides.ndjson",
      "cp /tmp/c.json .outside-in/checkpoints/FR-X.json",
      "sed -i s/a/b/ .outside-in/metrics-baseline.json",
    ];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
    const { stderr } = runHook("before-step", { tool_input: { command: "echo x > .outside-in/overrides.ndjson" } });
    expect(stderr.includes(".outside-in/ is written only by oid")).toBe(true);
  });

  it("refuses to undo a change to any project file through git", () => {
    focusedAt("tdd_green");
    write("docs/bootstrap-log.md", "row\n");
    const commands = ["git checkout docs/bootstrap-log.md", "git checkout -- SPEC.md", "git checkout .", "git checkout HEAD docs/bootstrap-log.md", "git restore docs/a.md", "git restore --source=HEAD progress.json", "git restore --staged --worktree docs/a.md", "git checkout -- .outside-in/overrides.ndjson", "git stash", "git reset --hard", "git clean -fd"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 2));
    const { stderr } = runHook("before-step", { tool_input: { command: "git checkout docs/bootstrap-log.md" } });
    expect(stderr.includes("to undo a change, use Edit (git cannot discard work in the project's files)")).toBe(true);
  });

  it("lets the generated directories and git commands that do not undo through", () => {
    focusedAt("tdd_green");
    const commands = ["echo x > dist/x", "echo x > coverage/x", "echo x > node_modules/.cache/x", "echo x | tee -a dist/log.txt", "cp /tmp/x dist/x", "git checkout main", "git checkout -b x", "git switch main", "git restore --staged docs/a.md", "git checkout -- dist/x", "git add docs/a.md", "git commit -F - <<EOF\nmsg\nEOF", "git clean -n", "git stash list"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("lets .outside-in/ be read or copied out, and the project's files be read or copied to outside", () => {
    focusedAt("tdd_green");
    const commands = ["cat .outside-in/overrides.ndjson", "cp .outside-in/checkpoints/FR-X.json /tmp/x", "cp docs/a.md /tmp/x", "grep -n x docs/a.md", "head -3 docs/a.md", "sed -n 1,3p docs/a.md", "git diff", "git show HEAD:docs/a.md", `python3 -c "print(open('docs/a.md').read())"`];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("lets deleting, and moving inside the project, through: they write no new content", () => {
    focusedAt("tdd_green");
    const commands = ["rm docs/a.md", "git rm docs/a.md", "mv docs/a.md docs/b.md", "git mv src/a.ts src/b.ts", "mv a tests/b", "mv -t docs a b"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("lets the project tools and a versioned script through", () => {
    write("scripts/record-replays.mjs", "import { writeFileSync } from 'node:fs';\nwriteFileSync('docs/a.md', 'x');\n");
    focusedAt("tdd_green");
    const commands = ["node scripts/record-replays.mjs", "npm run test:unit", "npx tsc --noEmit", "oid progress step FR-X-01 refactor --help", "oid metrics --baseline"];
    expect(statusesOf(commands)).toEqual(commands.map(() => 0));
  });

  it("lets a command through when analysing it throws, and still runs the oid checks on it", () => {
    focusedAt("tdd_green");
    const unanalysable = "python3 scripts/a\0b.py";
    const { status, stderr } = runHook("before-step", { tool_input: { command: `${unanalysable} && oid progress revise FR-X-01` } });
    expect({ alone: statusesOf([unanalysable]), revise: status, human: stderr.includes("run by the human") }).toEqual({ alone: [0], revise: 2, human: true });
  });
});
