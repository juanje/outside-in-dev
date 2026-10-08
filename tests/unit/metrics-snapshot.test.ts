import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dir, useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";
import { runOid } from "./run-capture.js";

useTempDir();

const BLOCK = "export function NAME(items: number[]): number {\n  let sum = 0;\n  for (const item of items) {\n    sum += item * 1;\n    sum -= 1;\n  }\n  const average = sum / items.length;\n  return Math.round(average);\n}\n";

async function runMetrics(): Promise<string> {
  const { stdout } = await runOid(["metrics"], dir);
  return stdout;
}

function history(): { date: string; counts: Record<string, number>; duplication: Record<string, number> }[] {
  return readFileSync(join(dir, ".outside-in/metrics.jsonl"), "utf8").split("\n").filter((line) => line !== "").map((line) => JSON.parse(line));
}

describe("oid metrics snapshot", () => {
  it("records the counts and the duplicated-line percentages of source and test files, and says it is the first snapshot", async () => {
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "tests/unit"), { recursive: true });
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ include: ["src/**/*.ts", "tests/**/*.ts"] }));
    writeFileSync(join(dir, "src/orders.ts"), BLOCK.replace("NAME", "orderTotal"));
    writeFileSync(join(dir, "src/invoices.ts"), BLOCK.replace("NAME", "invoiceTotal"));
    writeFileSync(join(dir, "src/names.ts"), 'export const first = "Ada";\nexport const second = "Grace";\n');
    writeFileSync(join(dir, "tests/unit/names.test.ts"), 'export const third = "Alan";\n');
    const stdout = await runMetrics();
    expect(stdout.split("\n")).toContain("trend: first snapshot");
    const [snapshot] = history();
    expect(snapshot!.counts).toEqual({ complexity: 0, dead_code: 0, doc_drift: 0, duplication: 1, magic_value: 0 });
    expect(snapshot!.duplication).toEqual({ source: 90, tests: 0 });
  }, REAL_PROCESS_TIMEOUT_MS);
});
