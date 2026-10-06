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
