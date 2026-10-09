import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("readOnlyCredentials", () => {
  it("serves the credentials of the auth.json of the agent directory and never writes, creating nothing when there is none", async () => {
    const { readOnlyCredentials } = await import("../../src/artifacts/pi-credentials.js");
    const agentDir = join(dir, "agent");
    const absent = readOnlyCredentials(agentDir);
    expect(await absent.read("anthropic")).toBeUndefined();
    expect(await absent.list()).toEqual([]);
    expect(existsSync(agentDir)).toBe(false);
    write("agent/auth.json", JSON.stringify({ anthropic: { type: "api_key", key: "k-1" }, codex: { type: "oauth", access: "a" } }));
    const store = readOnlyCredentials(agentDir);
    expect(await store.read("anthropic")).toEqual({ type: "api_key", key: "k-1" });
    expect(await store.read("openai")).toBeUndefined();
    expect(await store.list()).toEqual([{ providerId: "anthropic", type: "api_key" }, { providerId: "codex", type: "oauth" }]);
    expect(await store.modify("anthropic", async () => ({ type: "api_key", key: "k-2" }))).toEqual({ type: "api_key", key: "k-1" });
    await store.delete("anthropic");
    expect(JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf8"))).toHaveProperty("anthropic.key", "k-1");
  });
});
