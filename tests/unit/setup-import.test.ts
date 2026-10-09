import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { setup } from "./setup-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const LOGIN = { type: "oauth", access: "access-token-1", refresh: "refresh-token-1", expires: 1 };

describe("oid setup --import-pi", () => {
  it("copies the credentials of the Pi installation, names the providers but not the secrets, and warns about the shared logins", async () => {
    write("pi/auth.json", JSON.stringify({ openai: { type: "api_key", key: "sk-pi-secret" }, "openai-codex": LOGIN }));
    const { exitCode, stdout, stderr, agentDir } = await setup(["--import-pi"]);
    expect(exitCode).toBe(0);
    expect(existsSync(join(agentDir, "auth.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf8"))).toEqual({ openai: { type: "api_key", key: "sk-pi-secret" }, "openai-codex": LOGIN });
    expect(stdout).toContain("openai, openai-codex");
    expect(stdout).toContain("refresh token");
    expect((stdout + stderr).includes("sk-pi-secret") || (stdout + stderr).includes("refresh-token-1")).toBe(false);
  });

  it("refuses an import that finds no credentials and writes nothing", async () => {
    await expect(setup(["--import-pi"])).rejects.toThrow("no credentials");
    expect(existsSync(join(dir, "config"))).toBe(false);
  });
});
