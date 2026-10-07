import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savePendingInput } from "../../src/orchestrator/session.js";

const request = { id: "request-1", prompt: "Accept the ambiguous Red?", actions: [{ key: "approve", label: "Approve" }] };

describe("savePendingInput", () => {
  let cwd = "";
  const sessionPath = () => join(cwd, ".outside-in", "session.json");

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "oid-session-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("creates the session of the run with the pending request and no temporary file", () => {
    savePendingInput(cwd, "run-1", request);
    expect(JSON.parse(readFileSync(sessionPath(), "utf8"))).toEqual({ runId: "run-1", pendingInput: request });
    expect(readdirSync(join(cwd, ".outside-in")).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("keeps the other fields of a saved session", () => {
    mkdirSync(join(cwd, ".outside-in"));
    writeFileSync(sessionPath(), JSON.stringify({ runId: "run-1", state: "CODE_GREEN", pendingInput: null }));
    savePendingInput(cwd, "run-1", request);
    expect(JSON.parse(readFileSync(sessionPath(), "utf8"))).toEqual({ runId: "run-1", state: "CODE_GREEN", pendingInput: request });
  });
});
