import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

let home: string;

beforeEach(() => {
  home = join(dir, "home");
  mkdirSync(join(dir, "project"), { recursive: true });
  vi.stubEnv("HOME", home);
  write("home/.ssh/id_rsa", "key");
  write("home/.aws/credentials", "key");
  write("home/.gnupg/pubring.kbx", "key");
  write("project/.env", "A=1");
  write("project/src/a.ts", "");
  symlinkSync(join(home, ".ssh", "id_rsa"), join(dir, "project", "link.txt"));
  symlinkSync(".env", join(dir, "project", "notes.txt"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSecret", () => {
  it("tells the secret files from the others, through symbolic links and in the user's home", async () => {
    const { isSecret } = await import("../../src/agents/secrets.js");
    const worktree = join(dir, "project");
    for (const secret of [".env", ".env.local", "a/.env.production", "x/server.pem", "k.key", "secrets/t.txt", "secrets", "d/secrets/x/y", "auth.json", "sub/auth.json", "notes.txt", "link.txt", "~/.ssh/id_rsa", "~/.ssh", "~/.aws/credentials", "~/.gnupg/pubring.kbx", join(home, ".ssh", "id_rsa"), "src/../.env"]) {
      expect(isSecret(worktree, secret), secret).toBe(true);
    }
    for (const plain of ["src/a.ts", ".", "src", "environment.ts", "keys.ts", "~/.bashrc"]) {
      expect(isSecret(worktree, plain), plain).toBe(false);
    }
  });

  it("treats the account's real home directories as secrets when HOME points elsewhere", async () => {
    const { isSecret } = await import("../../src/agents/secrets.js");
    const worktree = join(dir, "project");
    const realHome = join(dir, "real-home");
    for (const name of [".ssh", ".aws", ".gnupg"]) {
      expect(isSecret(worktree, join(realHome, name, "file"), realHome), name).toBe(true);
    }
    expect(isSecret(worktree, join(realHome, ".bashrc"), realHome)).toBe(false);
  });
});
