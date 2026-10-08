import { describe, expect, it } from "vitest";
import { triage } from "../../src/orchestrator/refactor-findings.js";
import type { Finding } from "../../src/artifacts/findings.js";

const finding = (id: string, category: Finding["category"]): Finding => ({ id, category, file: "src/cart.ts", range: { start: 2, end: 4 }, detail: "a detail" });

describe("triage of the findings of a Green", () => {
  it("keeps every finding, as the conservative default does when no decision model answers", () => {
    const findings = [finding("magic-0001", "magic_value"), finding("doc-0001", "doc_drift"), finding("dead-0001", "dead_code")];
    expect(triage(findings)).toEqual(findings);
  });
});
