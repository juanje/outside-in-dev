import { createEditTool } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { openProfileSession } from "../../src/agents/profile-session.js";
import { fakePiSdk } from "./fake-pi-sdk.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

type Hook = (context: unknown) => Promise<{ content?: { type: string; text?: string }[] } | undefined>;

/** What the agent is shown after Pi's real edit tool ran `oldText` to `newText` on `file`, through the hook of an opened CODE_GREEN session. */
async function shownAfterEdit(file: string, oldText: string, newText: string): Promise<{ failed: boolean; text: string }> {
  writeMinimalConfig();
  const { sdk, sessions } = fakePiSdk(() => ({ agent: {}, abort: async () => {} }));
  await openProfileSession({ state: "CODE_GREEN", worktree: dir, agentDir: "/oid/agent", sessionsDir: `${dir}/sessions` }, sdk);
  const after = (sessions[0] as { agent: { afterToolCall: Hook } }).agent.afterToolCall;
  const args = { path: file, edits: [{ oldText, newText }] };
  let result: { content: { type: string; text?: string }[] };
  let failed = false;
  try {
    result = (await createEditTool(dir).execute("1", args)) as typeof result;
  } catch (error) {
    failed = true;
    result = { content: [{ type: "text", text: (error as Error).message }] };
  }
  const changed = await after({ toolCall: { type: "toolCall", id: "1", name: "edit", arguments: args }, args, result, isError: failed });
  return { failed, text: (changed?.content ?? result.content).map((part) => part.text ?? "").join("") };
}

describe("hints after a failed edit", () => {
  it("tells the agent to copy an anchor that does not match exactly", async () => {
    write("src/a.ts", "const a = 1;\n");
    const { failed, text } = await shownAfterEdit("src/a.ts", "const b = 1;", "const b = 2;");
    expect(failed).toBe(true);
    expect(text).toContain("Could not find");
    expect(text).toContain("copy the anchor exactly, with spaces and line breaks");
    expect(text).toContain("read the file again first");
  });

  it("tells the agent to add surrounding lines when an anchor is not unique", async () => {
    write("src/a.ts", "const a = 1;\nconst a = 1;\n");
    const { failed, text } = await shownAfterEdit("src/a.ts", "const a = 1;", "const a = 2;");
    expect(failed).toBe(true);
    expect(text).toContain("occurrences");
    expect(text).toContain("add more surrounding lines to make it unique");
  });

  it("tells the agent when the replacement is identical to the original", async () => {
    write("src/a.ts", "const a = 1;\n");
    const { failed, text } = await shownAfterEdit("src/a.ts", "const a = 1;", "const a = 1;");
    expect(failed).toBe(true);
    expect(text).toContain("No changes made");
    expect(text).toContain("the replacement is identical to the original");
  });
});
