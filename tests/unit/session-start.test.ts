import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startSession, updateSession } from "../../src/orchestrator/session.js";

describe("starting a session", () => {
  let cwd = "";
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "oid-session-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("replaces whatever an earlier run saved, its pending question included", () => {
    mkdirSync(join(cwd, ".outside-in"));
    writeFileSync(join(cwd, ".outside-in/session.json"), JSON.stringify({ runId: "old", state: "BASELINE", pendingInput: { id: "q", prompt: "Old?", actions: [] } }));
    startSession(cwd, { runId: "new", worktree: "/w", branch: "oid/x", baseCommit: "abc", state: "PREFLIGHT" });
    expect(JSON.parse(readFileSync(join(cwd, ".outside-in/session.json"), "utf8"))).toEqual({ runId: "new", worktree: "/w", branch: "oid/x", baseCommit: "abc", state: "PREFLIGHT" });
  });

  it("takes later changes of the same run, keeping the rest", () => {
    startSession(cwd, { runId: "new", worktree: "/w", branch: "oid/x", baseCommit: "abc", state: "PREFLIGHT" });
    updateSession(cwd, { state: "FEATURE_WRITE", targetFrs: ["FR-A-01"] });
    expect(JSON.parse(readFileSync(join(cwd, ".outside-in/session.json"), "utf8"))).toEqual({ runId: "new", worktree: "/w", branch: "oid/x", baseCommit: "abc", state: "FEATURE_WRITE", targetFrs: ["FR-A-01"] });
  });
});
