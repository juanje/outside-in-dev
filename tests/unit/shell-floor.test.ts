import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { checkShell, type ShellRules } from "../../src/agents/shell-floor.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

let rules: ShellRules;

beforeEach(() => {
  write("progress.json", "{}");
  write("package.json", "{}");
  write(".outside-in/state.json", "{}");
  write("src/a.ts", "");
  const outside = mkdtempSync(join(tmpdir(), "oid-outside-"));
  symlinkSync("../progress.json", join(dir, "src/state.json"));
  symlinkSync("../.outside-in", join(dir, "src/runs"));
  symlinkSync(outside, join(dir, "src/outside"));
  mkdirSync(join(dir, "features"));
  rules = {
    worktree: dir,
    commands: ["npx vitest run", "npx tsc --noEmit", 'npm run build && NODE_OPTIONS="--import tsx" npx cucumber-js'],
    deny: ["progress.json", "package.json", ".outside-in*", ".outside-in*/**", ".git", ".git/**"],
    state: ["progress.json", ".outside-in*", ".outside-in*/**", ".git", ".git/**"],
  };
});

/** The reason a command is blocked for, or undefined when it is allowed. */
function reasonFor(command: string): string | undefined {
  const verdict = checkShell(command, rules);
  return verdict.block ? verdict.reason : undefined;
}

describe("checkShell", () => {
  it("allows the project's own commands, the probes and writes inside the worktree", () => {
    for (const command of [
      "npx vitest run tests/unit/a.test.ts",
      "npx tsc --noEmit && npx vitest run",
      'npm run build && NODE_OPTIONS="--import tsx" npx cucumber-js features/x.feature',
      "ls src",
      "cat src/a.ts | grep x",
      "echo hi > src/out.txt 2>&1",
      "cat src/a.ts 2>/dev/null",
      "rm -rf src/tmp",
      "mkdir -p src/new && cp src/a.ts src/new/b.ts",
      'bash -c "npx vitest run"',
    ]) {
      expect(reasonFor(command), command).toBeUndefined();
    }
  });

  it("blocks writes to what only the orchestrator writes, however the command is spelled", () => {
    for (const command of [
      "echo x > progress.json",
      "echo x >> progress.json",
      "echo x 2> progress.json",
      "rm progress.json",
      "rm -rf .outside-in",
      "cp src/a.ts .outside-in/checkpoint",
      "mv progress.json src/p.txt",
      "touch package.json",
      "echo x > .git/config",
      "echo x > features/../progress.json",
      "rm -rf .",
      "rm -rf *",
      "sed -i s/a/b/ progress.json",
      "echo x > src/state.json",
      "rm -rf src/runs",
      "dd if=src/a.ts of=progress.json",
      'bash -c "echo x > progress.json"',
      "sh -c 'rm -rf .outside-in'",
      "bash -c \"sh -c 'echo x > progress.json'\"",
      "npx vitest run && echo x > progress.json",
    ]) {
      expect(reasonFor(command), command).toBeDefined();
    }
    expect(reasonFor("echo x > progress.json")).toContain("progress.json");
  });

  it("blocks paths outside the worktree, git, inline code and anything it cannot settle", () => {
    expect(reasonFor("git commit -am x")).toContain("git stays with the orchestrator");
    expect(reasonFor("/usr/bin/git status")).toContain("git stays with the orchestrator");
    expect(reasonFor("bash -c 'git status'")).toContain("git stays with the orchestrator");
    expect(reasonFor("curl https://example.com")).toContain("not allowed");
    for (const command of [
      "cat ../outside.txt",
      "cat /etc/hostname",
      "cat ~/.ssh/id_rsa",
      "echo x > src/outside/file.txt",
      "cat src/outside/../x",
      "ls --path=../..",
      "node -e \"require('fs').writeFileSync('progress.json', '')\"",
      'npx tsx -e "console.log(1)"',
      'eval "echo x > progress.json"',
      "echo $(cat progress.json)",
      "echo `cat progress.json`",
      "echo x > $HOME/file",
      "cd src && ls",
      "bash script.sh",
      "xargs rm < list.txt",
      "ls; (rm -rf src)",
    ]) {
      expect(reasonFor(command), command).toBeDefined();
    }
    expect(reasonFor("echo $(ls)")).toContain("cannot be checked");
  });

  it("blocks every argument that names orchestrator state or the outside of the worktree, whatever the command", () => {
    for (const command of [
      "npx vitest run --outputFile=progress.json",
      "npx vitest run --outputFile progress.json",
      "npx vitest run -o=.outside-in/result.json",
      "npx vitest run --outputFile=features/../.git/result",
      "npx vitest run --outputFile=src/state.json",
      "npx vitest run src/runs",
      "npx tsc --noEmit --project ../elsewhere/tsconfig.json",
      "npx vitest run --root=/etc",
      "cat progress.json",
      "grep x .outside-in/state.json",
      'bash -c "npx vitest run --outputFile=progress.json"',
    ]) {
      expect(reasonFor(command), command).toBeDefined();
    }
    expect(reasonFor("npx vitest run --outputFile=progress.json")).toContain("progress.json");
    for (const command of ["npx vitest run --reporter=verbose --config package.json tests/unit/a.test.ts", "cat package.json", "ls .", "npx vitest run --outputFile=src/result.json"]) {
      expect(reasonFor(command), command).toBeUndefined();
    }
  });
});
