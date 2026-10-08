import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/artifacts/findings.js";
import { keepPendingFindings } from "../../src/orchestrator/session.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

const finding = (id: string): Finding => ({ id, category: "magic_value", file: "src/cart.ts", range: { start: 2, end: 4 }, detail: "the number 100" });

describe("keepPendingFindings", () => {
  it("saves the findings of each rejected refactor in a numbered file of the run and lists the files in the session", () => {
    write(".outside-in/session.json", JSON.stringify({ runId: "run-1", state: "REFACTOR" }));
    keepPendingFindings(dir, "run-1", [finding("magic-0001")]);
    keepPendingFindings(dir, "run-1", [finding("magic-0002")]);
    const session = JSON.parse(readFileSync(join(dir, ".outside-in/session.json"), "utf8"));
    expect(session).toEqual({ runId: "run-1", state: "REFACTOR", pendingFindings: [".outside-in/runs/run-1/findings/1.json", ".outside-in/runs/run-1/findings/2.json"] });
    expect(JSON.parse(readFileSync(join(dir, session.pendingFindings[1]), "utf8"))).toEqual([finding("magic-0002")]);
  });
});
