import { describe, expect, it } from "vitest";
import * as pi from "@earendil-works/pi-coding-agent";
import { isPathShaped, pathsOf, TOOL_PATH_ARGS } from "../../src/agents/tool-paths.js";

describe("pathsOf", () => {
  it("names the paths a tool call touches, the worktree root for a search without a path, and nothing for an unknown tool", () => {
    expect(pathsOf("read", { path: "src/a.ts" })).toEqual(["src/a.ts"]);
    expect(pathsOf("write", { path: "tests/unit/a.test.ts", content: "x" })).toEqual(["tests/unit/a.test.ts"]);
    expect(pathsOf("edit", { path: "src/a.ts", edits: [] })).toEqual(["src/a.ts"]);
    expect(pathsOf("grep", { pattern: "x", path: "src" })).toEqual(["src"]);
    expect(pathsOf("grep", { pattern: "x" })).toEqual(["."]);
    expect(pathsOf("find", { pattern: "*.ts" })).toEqual(["."]);
    expect(pathsOf("ls", {})).toEqual(["."]);
    expect(pathsOf("bash", { command: "ls" })).toEqual([]);
    expect(pathsOf("report", { status: "done" })).toEqual([]);
    expect(pathsOf("read", {})).toBeUndefined();
    expect(pathsOf("read", { path: 3 })).toBeUndefined();
    expect(pathsOf("teleport", { path: "src/a.ts" })).toBeUndefined();
  });
});

describe("TOOL_PATH_ARGS", () => {
  it("declares every path-shaped parameter of every tool that Pi offers", () => {
    const tools = [pi.createReadToolDefinition, pi.createWriteToolDefinition, pi.createEditToolDefinition, pi.createGrepToolDefinition, pi.createFindToolDefinition, pi.createLsToolDefinition, pi.createBashToolDefinition].map((create) => create("/"));
    expect(tools).toHaveLength(7);
    for (const tool of tools) {
      const declared = TOOL_PATH_ARGS[tool.name];
      expect(declared, `${tool.name} is missing from the table`).toBeDefined();
      const shaped = Object.keys(tool.parameters.properties).filter(isPathShaped);
      for (const name of shaped) expect(declared, `${tool.name}.${name}`).toContain(name);
    }
    expect(isPathShaped("path")).toBe(true);
    expect(isPathShaped("destination")).toBe(true);
    expect(isPathShaped("content")).toBe(false);
  });
});
