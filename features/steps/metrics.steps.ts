import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import type { OidWorld } from "../support/world.js";

const DEFAULT_TSCONFIG = {
  compilerOptions: { strict: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ES2022" },
  include: ["src/**/*.ts", "tests/**/*.ts"],
};

const CONFIG_FILE = ".outside-in.json";

const DEFAULT_CONFIG: Record<string, unknown> = {
  version: 1,
  stack: "typescript",
  paths: {
    source: ["src/**"],
    shared: [],
    unit_tests: ["tests/unit/**"],
    bdd_features: ["features/**/*.feature"],
    bdd_steps: ["features/steps/**", "features/support/**"],
    docs: ["README.md", "docs/**"],
    spec: "SPEC.md",
    design: ["SPEC.md"],
    progress: "progress.json",
  },
  commands: { bdd: "bdd", unit: "unit", typecheck: "tsc", format: null, lint: null, coverage: null, extra_checks: [] },
};

/** Sets `value` at the dotted `field` of `target`, creating the objects on the way. */
function setField(target: Record<string, unknown>, field: string, value: unknown): void {
  const keys = field.split(".");
  const last = keys.pop()!;
  let node = target;
  for (const key of keys) node = (node[key] ??= {}) as Record<string, unknown>;
  node[last] = value;
}

Given("a TypeScript project", function (this: OidWorld) {
  this.write("tsconfig.json", `${JSON.stringify(DEFAULT_TSCONFIG, null, 2)}\n`);
});

Given("the project has no {string} file", function (this: OidWorld, path: string) {
  rmSync(this.path(path), { force: true });
});

Given("a project configuration with:", function (this: OidWorld, table: { raw: () => string[][] }) {
  const config = structuredClone(DEFAULT_CONFIG);
  for (const [field, value] of table.raw()) setField(config, field!, JSON.parse(value!));
  this.write(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
});

Then("the output lists these in order:", function (this: OidWorld, table: { raw: () => string[][] }) {
  let from = 0;
  for (const [expected] of table.raw()) {
    const found = this.stdout.indexOf(expected!, from);
    assert.ok(found >= 0, `"${expected}" is missing, or out of order, in:\n${this.stdout}`);
    from = found + expected!.length;
  }
});

/** The lines of the output that report one finding of `category` (not its summary count). */
function findingLines(output: string, category: string): string[] {
  const finding = new RegExp(`^${category} \\S+:\\d+-\\d+ `);
  return output.split("\n").filter((line) => finding.test(line));
}

/** The count the summary line gives for `category`, or 0 when the summary does not list it. */
function summaryCount(output: string, category: string): number {
  const entry = new RegExp(`^(?:.*, )?${category} (\\d+)(?:,.*)?$`);
  for (const line of output.split("\n")) {
    const match = entry.exec(line);
    if (match) return Number(match[1]);
  }
  return 0;
}

Then("the output has no {word} findings", function (this: OidWorld, category: string) {
  const lines = findingLines(this.stdout, category);
  assert.deepEqual(lines, [], `unexpected ${category} findings in:\n${this.stdout}`);
});

Then("the {word} findings do not mention {string}", function (this: OidWorld, category: string, text: string) {
  const lines = findingLines(this.stdout, category).filter((line) => line.includes(text));
  assert.deepEqual(lines, [], `${category} findings mention "${text}" in:\n${this.stdout}`);
});

Then("the summary counts {word} {int}", function (this: OidWorld, category: string, count: number) {
  assert.equal(summaryCount(this.stdout, category), count, `summary does not count ${category} ${count} in:\n${this.stdout}`);
});
