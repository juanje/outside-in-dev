import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("mergeCredentials", () => {
  it("adds the credentials to the auth.json of the agent directory, replaces the ones of the same provider, keeps the others and makes the file private", async () => {
    const { mergeCredentials } = await import("../../src/artifacts/pi-credentials.js");
    write("agent/auth.json", JSON.stringify({ anthropic: { type: "api_key", key: "a" }, openai: { type: "api_key", key: "old" } }));
    mergeCredentials(`${dir}/agent`, { openai: { type: "api_key", key: "new" }, openrouter: { type: "api_key", key: "o" } });
    const path = `${dir}/agent/auth.json`;
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ anthropic: { type: "api_key", key: "a" }, openai: { type: "api_key", key: "new" }, openrouter: { type: "api_key", key: "o" } });
    expect((statSync(path).mode & 0o777).toString(8)).toBe("600");
  });
});

describe("readPiCredentials", () => {
  it("reads the API keys and the logins that the auth.json of a Pi agent directory holds", async () => {
    const { readPiCredentials } = await import("../../src/artifacts/pi-credentials.js");
    const login = { type: "oauth", access: "a", refresh: "r", expires: 1 };
    write("pi/auth.json", JSON.stringify({ openai: { type: "api_key", key: "k" }, "openai-codex": login }));
    expect(readPiCredentials(`${dir}/pi`)).toEqual({ openai: { type: "api_key", key: "k" }, "openai-codex": login });
  });

  it("refuses to import when there is no auth.json or it holds no credential, naming the directory", async () => {
    const { readPiCredentials } = await import("../../src/artifacts/pi-credentials.js");
    expect(() => readPiCredentials(`${dir}/pi`)).toThrow(`no credentials in ${dir}/pi`);
    write("pi/auth.json", "{}");
    expect(() => readPiCredentials(`${dir}/pi`)).toThrow(`no credentials in ${dir}/pi`);
  });
});
