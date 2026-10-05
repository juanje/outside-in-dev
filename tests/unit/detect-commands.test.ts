import { describe, expect, it } from "vitest";
import { detectCommands } from "../../src/artifacts/project-setup.js";

describe("detectCommands", () => {
  it("names the scripts that run vitest, cucumber-js and tsc --noEmit", () => {
    const commands = detectCommands({
      build: "tsc",
      "check-types": "tsc --noEmit",
      unit: "vitest run",
      features: 'cucumber-js --tags "not @wip"',
    });
    expect(commands).toMatchObject({
      unit: "npm run unit",
      bdd: "npm run features",
      typecheck: "npm run check-types",
    });
  });

  it("falls back to the standard invocations when no script matches", () => {
    expect(detectCommands({ build: "tsc" })).toMatchObject({
      unit: "npx vitest run",
      bdd: 'NODE_OPTIONS="--import tsx" npx cucumber-js',
      typecheck: "npx tsc --noEmit",
    });
  });

  it("names the scripts that run prettier and eslint", () => {
    expect(detectCommands({ pretty: "prettier --check .", lint: "eslint src" })).toMatchObject({
      format: "npm run pretty",
      lint: "npm run lint",
    });
  });

  it("leaves format and lint null when no script runs a formatter or linter", () => {
    expect(detectCommands({ build: "tsc" })).toMatchObject({ format: null, lint: null });
  });

  it.each([
    ["biome lint .", "lint"],
    ["biome check .", "lint"],
    ["biome format .", "format"],
  ])("recognises %s as the %s script", (command, kind) => {
    expect(detectCommands({ tidy: command })).toMatchObject({ [kind]: "npm run tidy" });
  });
});
