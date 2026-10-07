import { existsSync, lstatSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addCommand, parseDependencyRequest, requestDependencyTool } from "../../src/agents/tools/request-dependency.js";

import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const reason = "HTTP client for steps";

describe("parseDependencyRequest", () => {
  it("accepts a plain or scoped npm name with an optional semver range or dist-tag and a reason, and refuses anything else", () => {
    expect(parseDependencyRequest({ name: "undici", version: "^7", dev: true, reason })).toEqual({ name: "undici", version: "^7", dev: true, reason });
    expect(parseDependencyRequest({ name: "@types/node", dev: false, reason })).toEqual({ name: "@types/node", dev: false, reason });
    for (const version of ["latest", "next", "1.2.3-beta.1", ">=1 <2", "~3.1.0", "1.x", "^1 || ^2"]) {
      expect(parseDependencyRequest({ name: "zod", version, dev: false, reason })?.version).toBe(version);
    }

    const refused = [
      { name: "../evil" },
      { name: "a/b" },
      { name: "@scope/a/b" },
      { name: "@scope/" },
      { name: "-g" },
      { name: "left pad" },
      { name: "lodash; rm -rf /" },
      { name: "Lodash" },
      { name: "http://evil.example/p.tgz" },
      { name: "git+ssh://git@evil.example/p.git" },
      { name: "file:../p" },
      { name: "github:user/repo" },
      { name: "a..b" },
      { name: "lodash", version: "^1; rm -rf /" },
      { name: "lodash", version: "$(whoami)" },
      { name: "lodash", version: "1 && x" },
      { name: "lodash", version: "-g" },
      { name: "lodash", version: "git+https://evil.example/p.git" },
      { name: "lodash", version: "file:../p" },
      { name: "lodash", version: "" },
      { name: "lodash", reason: "" },
      { name: "lodash", reason: "   " },
      { name: "lodash", dev: "yes" },
      { name: "lodash", extra: 1 },
    ];
    for (const given of refused) expect(parseDependencyRequest({ dev: false, reason, ...given }), JSON.stringify(given)).toBeUndefined();
    expect(parseDependencyRequest({ name: "lodash", reason })).toBeUndefined();
  });
});

describe("addCommand", () => {
  it("adds the package with the package manager of the lockfile, npm without one, as an argument array", () => {
    const runtime = { name: "lodash", version: "^4", dev: false, reason };
    const dev = { name: "@types/node", dev: true, reason };

    expect(addCommand(dir, runtime)).toEqual(["npm", "install", "lodash@^4"]);
    write("package-lock.json", "{}");
    expect(addCommand(dir, dev)).toEqual(["npm", "install", "-D", "@types/node"]);
    rmSync(join(dir, "package-lock.json"));
    write("pnpm-lock.yaml", "");
    expect(addCommand(dir, dev)).toEqual(["pnpm", "add", "-D", "@types/node"]);
    expect(addCommand(dir, runtime)).toEqual(["pnpm", "add", "lodash@^4"]);
    rmSync(join(dir, "pnpm-lock.yaml"));
    write("yarn.lock", "");
    expect(addCommand(dir, dev)).toEqual(["yarn", "add", "-D", "@types/node"]);
  });
});

type Run = { command: string[]; cwd: string };

function execute(tool: ReturnType<typeof requestDependencyTool>, args: Record<string, unknown>) {
  return tool.execute("call-1", args as never, undefined, undefined, {} as never);
}

describe("requestDependencyTool", () => {
  it("asks the approver, installs an approved package in the worktree and tells the agent", async () => {
    write("package-lock.json", "{}");
    const asked: unknown[] = [];
    const runs: Run[] = [];
    const tool = requestDependencyTool({
      worktree: dir,
      approve: async (request) => (asked.push(request), { approved: true }),
      install: (command, cwd) => void runs.push({ command, cwd }),
    });

    const result = await execute(tool, { name: "undici", version: "^7", dev: true, reason });

    expect(tool.name).toBe("request_dependency");
    expect(asked).toEqual([{ name: "undici", version: "^7", dev: true, reason }]);
    expect(runs).toEqual([{ command: ["npm", "install", "-D", "undici@^7"], cwd: dir }]);
    expect(JSON.stringify(result.content)).toContain("Installed undici@^7");
  });

  it("installs nothing and says so, with the note, when the request is rejected", async () => {
    const runs: Run[] = [];
    const tool = requestDependencyTool({ worktree: dir, approve: async () => ({ approved: false, note: "Use the built-in fetch" }), install: (command, cwd) => void runs.push({ command, cwd }) });

    const result = await execute(tool, { name: "undici", dev: true, reason });

    expect(runs).toEqual([]);
    expect(JSON.stringify(result.content)).toContain("not approved");
    expect(JSON.stringify(result.content)).toContain("Use the built-in fetch");
  });

  it("refuses an invalid request without asking or installing", async () => {
    const asked: unknown[] = [];
    const runs: Run[] = [];
    const tool = requestDependencyTool({ worktree: dir, approve: async (request) => (asked.push(request), { approved: true }), install: (command, cwd) => void runs.push({ command, cwd }) });

    await expect(execute(tool, { name: "lodash; rm -rf /", dev: false, reason })).rejects.toThrow("not valid");

    expect(asked).toEqual([]);
    expect(runs).toEqual([]);
  });

  it("tells the agent the installation failed, with the installer's error", async () => {
    const tool = requestDependencyTool({
      worktree: dir,
      approve: async () => ({ approved: true }),
      install: () => {
        throw new Error("network unreachable");
      },
    });

    await expect(execute(tool, { name: "undici", dev: true, reason })).rejects.toThrow(/installation failed.*network unreachable/);
  });

  it("gives the worktree its own node_modules before installing when it shares the main copy's", async () => {
    write("package-lock.json", "{}");
    write("main/node_modules/marker.txt", "main");
    symlinkSync(join(dir, "main/node_modules"), join(dir, "node_modules"), "dir");
    const runs: Run[] = [];
    const tool = requestDependencyTool({
      worktree: dir,
      approve: async () => ({ approved: true }),
      install: (command, cwd) => void runs.push({ command, cwd }),
    });

    await execute(tool, { name: "undici", dev: true, reason });

    expect(runs.map((run) => run.command)).toEqual([["npm", "ci"], ["npm", "install", "-D", "undici"]]);
    expect(lstatSync(join(dir, "node_modules"), { throwIfNoEntry: false })?.isSymbolicLink() ?? false).toBe(false);
    expect(existsSync(join(dir, "main/node_modules/marker.txt"))).toBe(true);
  });
});
