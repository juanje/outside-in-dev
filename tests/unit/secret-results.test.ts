import { readdirSync, statSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { createFindTool, createLsTool } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { Profile } from "../../src/agents/profiles.js";
import { installSandbox, type SandboxSession } from "../../src/agents/sandbox.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const coder: Profile = { state: "CODE_GREEN", builtins: ["read", "grep", "find", "ls", "write", "edit"], write: ["src/**/*.ts"], read: ["**"], deny: [], orchestratorState: [], shell: false, commands: [] };
type Result = { content: { type: "text"; text: string }[]; details: unknown };

function walk(root: string, folder = root): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? walk(root, path) : [relative(root, path)];
  });
}

/** What the agent is shown after `tool` returned `result` for `args`, through the sandbox's after-tool-call hook. */
async function shown(tool: string, args: Record<string, unknown>, result: Result): Promise<{ text: string; details: unknown }> {
  const session: SandboxSession = { agent: {}, abort: async () => undefined };
  installSandbox(session, coder, { worktree: dir, tools: coder.builtins });
  const after = session.agent.afterToolCall;
  if (!after) throw new Error("no after-tool-call hook installed");
  const changed = await after({ toolCall: { type: "toolCall", id: "1", name: tool, arguments: args }, args, result, isError: false } as never);
  const content = changed?.content ?? result.content;
  return { text: content.map((part) => (part.type === "text" ? part.text : "")).join(""), details: "details" in (changed ?? {}) ? changed?.details : result.details };
}

function text(result: { content: { type: string; text?: string }[] }): Result {
  return { content: result.content.map((part) => ({ type: "text", text: part.text ?? "" })), details: undefined };
}

describe("the result of a search tool", () => {
  it("never lists a secret file, as Pi's own ls and find tools return it", async () => {
    write(".env", "A=1");
    write("src/a.ts", "");
    write("secrets/t.txt", "x");
    write("config/server.pem", "x");
    symlinkSync(".env", join(dir, "notes.txt"));
    const ls = text(await createLsTool(dir).execute("1", {}));
    expect(ls.content[0]?.text).toContain(".env");
    expect((await shown("ls", {}, ls)).text).toBe("config/\nsrc/");
    const find = createFindTool(dir, { operations: { exists: () => true, glob: (_pattern, cwd) => walk(cwd) } });
    const found = text(await find.execute("1", { pattern: "*" }));
    expect(found.content[0]?.text).toContain("server.pem");
    expect((await shown("find", { pattern: "*" }, found)).text).toBe("src/a.ts");
  });

  it("drops the lines of secret files from a grep result and its details, and blocks what it cannot attribute", async () => {
    write("src/a.ts", "");
    const grep = ["src/a.ts:1: ok hunter2", ".env:1: API_KEY=hunter2", "secrets/t.txt-4- hunter2", "a-b/.env.local:3: hunter2", "src/a.ts-2- x:3: y", "", "[100 matches limit reached. Use limit=200 for more, or refine pattern]"].join("\n");
    const kept = await shown("grep", { pattern: "x" }, { content: [{ type: "text", text: grep }], details: { truncation: { content: grep } } });
    expect(kept.text).toBe("src/a.ts:1: ok hunter2\nsrc/a.ts-2- x:3: y\n\n[100 matches limit reached. Use limit=200 for more, or refine pattern]");
    expect(JSON.stringify(kept.details ?? null)).not.toContain("hunter2");
    const odd = await shown("grep", { pattern: "x" }, { content: [{ type: "text", text: "src/a.ts:1: ok\nsomething unexpected hunter2" }], details: undefined });
    expect(odd.text).not.toContain("hunter2");
    expect(odd.text).toContain("blocked");
  });
});
