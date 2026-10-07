import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Profile } from "../../src/agents/profiles.js";
import { installSandbox, SANDBOX_DENIALS_ABORT, type SandboxSession } from "../../src/agents/sandbox.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const DENY = ["progress.json", ".outside-in*", ".outside-in*/**", ".git", ".git/**"];
const STATE = ["progress.json", ".outside-in*", ".outside-in*/**", ".git", ".git/**"];
const tester: Profile = { state: "TDD_RED", builtins: ["read", "grep", "find", "ls", "write", "edit"], write: ["tests/unit/**/*.test.ts"], read: ["tests/unit/**/*.test.ts", "features/**/*.feature"], deny: DENY, orchestratorState: STATE, shell: false, commands: [] };
const coder: Profile = { state: "CODE_GREEN", builtins: [...tester.builtins, "bash"], write: ["src/**/*.ts"], read: ["**"], deny: DENY, orchestratorState: STATE, shell: true, commands: ["npx vitest run"] };

type Hook = NonNullable<SandboxSession["agent"]["beforeToolCall"]>;
type Fake = { session: SandboxSession; aborts: number[] };

function fakeSession(prior?: Hook): Fake {
  const fake: Fake = { aborts: [], session: { agent: { beforeToolCall: prior }, abort: async () => void fake.aborts.push(1) } };
  return fake;
}

async function call(session: SandboxSession, name: string, args: Record<string, unknown>) {
  const hook = session.agent.beforeToolCall;
  if (!hook) throw new Error("no hook installed");
  return hook({ toolCall: { type: "toolCall", id: "1", name, arguments: args }, args } as never);
}

beforeEach(() => {
  write("progress.json", "{}");
  write("src/a.ts", "");
  write("tests/unit/a.test.ts", "");
  write("tests/unit/notes.txt", "");
  mkdirSync(join(dir, "features"));
  symlinkSync("../progress.json", join(dir, "src/state.json"));
});

describe("installSandbox", () => {
  it("blocks the calls a step may not make, tells the agent what it may do and chains to the previous hook", async () => {
    const { session } = fakeSession();
    installSandbox(session, tester, { worktree: dir, tools: tester.builtins });

    expect(await call(session, "write", { path: "tests/unit/b.test.ts" })).toBeUndefined();
    expect(await call(session, "read", { path: "features/x.feature" })).toBeUndefined();
    expect(await call(session, "ls", { path: "tests/unit" })).toBeUndefined();
    expect(await call(session, "grep", { pattern: "x", path: "tests/unit/a.test.ts" })).toBeUndefined();

    const write = await call(session, "write", { path: "src/a.ts" });
    expect(write).toMatchObject({ block: true });
    expect(write?.reason).toContain("You may write: tests/unit/**/*.test.ts");
    expect(write?.reason).toContain("You may read: tests/unit/**/*.test.ts, features/**/*.feature");

    for (const [tool, args] of [
      ["read", { path: "src/a.ts" }],
      ["read", { path: "tests/unit/notes.txt" }],
      ["grep", { pattern: "x" }],
      ["find", { pattern: "*.ts" }],
      ["ls", { path: "." }],
      ["write", { path: "tests/unit/../../src/a.ts" }],
      ["write", { path: "tests/unit/a.test.ts/../../../x.test.ts" }],
      ["edit", { path: "src/state.json", edits: [] }],
      ["write", { path: "progress.json" }],
      ["read", { path: 3 }],
      ["teleport", { path: "tests/unit/a.test.ts" }],
      ["bash", { command: "ls" }],
    ] as const) {
      expect(await call(session, tool, args), `${tool} ${JSON.stringify(args)}`).toMatchObject({ block: true });
    }
    expect((await call(session, "bash", { command: "ls" }))?.reason).toContain("no shell");

    const prior = fakeSession(async () => ({ block: true, reason: "the previous hook says no" }));
    installSandbox(prior.session, tester, { worktree: dir, tools: tester.builtins });
    expect(await call(prior.session, "write", { path: "tests/unit/b.test.ts" })).toEqual({ block: true, reason: "the previous hook says no" });
  });

  it("runs the shell floor for a step with a shell", async () => {
    const { session } = fakeSession();
    installSandbox(session, coder, { worktree: dir, tools: coder.builtins });

    expect(await call(session, "bash", { command: "npx vitest run" })).toBeUndefined();
    expect(await call(session, "write", { path: "src/b.ts" })).toBeUndefined();
    expect(await call(session, "read", { path: "progress.json" })).toBeUndefined();
    expect(await call(session, "bash", { command: "echo x > progress.json" })).toMatchObject({ block: true });
    expect(await call(session, "bash", { command: "git status" })).toMatchObject({ block: true });
    expect(await call(session, "bash", { command: 3 })).toMatchObject({ block: true });
  });

  it("holds a shell write to the paths the step may write, as the write tool does", async () => {
    const { session } = fakeSession();
    installSandbox(session, coder, { worktree: dir, tools: coder.builtins });

    expect(await call(session, "bash", { command: "echo changed > tests/unit/a.test.ts" })).toMatchObject({ block: true, reason: expect.stringContaining("not writable") });
    expect(await call(session, "bash", { command: "echo changed > src/a.ts" })).toBeUndefined();
  });

  it("aborts the session once the denials pass the limit", async () => {
    expect(SANDBOX_DENIALS_ABORT).toBe(5);
    const { session, aborts } = fakeSession();
    installSandbox(session, tester, { worktree: dir, tools: tester.builtins, maxDenials: 2 });
    await call(session, "write", { path: "src/a.ts" });
    await call(session, "write", { path: "tests/unit/b.test.ts" });
    await call(session, "write", { path: "src/a.ts" });
    expect(aborts).toHaveLength(0);
    await call(session, "write", { path: "src/a.ts" });
    expect(aborts).toHaveLength(1);
  });
});

describe("installSandbox and secrets", () => {
  it("blocks every tool that names a secret, in every profile, and counts it as a denial", async () => {
    write(".env", "A=1");
    write("secrets/t.txt", "x");
    symlinkSync(".env", join(dir, "src/notes.txt"));
    for (const profile of [tester, coder]) {
      const { session, aborts } = fakeSession();
      installSandbox(session, profile, { worktree: dir, tools: profile.builtins });
      for (const [tool, path] of [["read", ".env"], ["grep", "secrets"], ["find", "secrets/t.txt"], ["ls", "secrets"], ["edit", "src/notes.txt"], ["write", "a/.env.local"]] as const) {
        const verdict = await call(session, tool, { path, pattern: "x" });
        expect(verdict, `${profile.state} ${tool} ${path}`).toMatchObject({ block: true });
        expect(verdict?.reason, `${profile.state} ${tool} ${path}`).toContain("secret");
      }
      expect(aborts).toHaveLength(1);
    }
  });
});
