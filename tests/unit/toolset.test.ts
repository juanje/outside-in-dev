import { describe, expect, it } from "vitest";
import type { Profile } from "../../src/agents/profiles.js";
import { buildToolset } from "../../src/agents/toolset.js";

const noShell: Profile = { state: "TDD_RED", builtins: ["read", "write"], write: [], read: [], deny: [], shell: false, commands: [] };
const withShell: Profile = { ...noShell, state: "CODE_GREEN", builtins: ["read", "write", "bash"], shell: true };

describe("buildToolset", () => {
  it("derives the allowlist and the custom tools from one array and excludes the shell of a step that has none", () => {
    const report = { name: "report" };
    const request = { name: "request_dependency" };

    const plain = buildToolset(noShell, []);
    expect(plain).toEqual({ names: ["read", "write"], customTools: [], excludeTools: ["bash"] });

    const custom = buildToolset(noShell, [report, request] as never);
    expect(custom.names).toEqual(["read", "write", "report", "request_dependency"]);
    expect(custom.customTools).toEqual([report, request]);

    const shell = buildToolset(withShell, [report] as never);
    expect(shell.names).toEqual(["read", "write", "bash", "report"]);
    expect(shell.excludeTools).toEqual([]);
  });
});
