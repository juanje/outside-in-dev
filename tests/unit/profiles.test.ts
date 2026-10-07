import { describe, expect, it } from "vitest";
import { CYCLE_STATES, profileFor } from "../../src/agents/profiles.js";
import { parseProjectConfig } from "../../src/artifacts/project-config.js";

const config = parseProjectConfig({
  version: 1,
  stack: "typescript",
  paths: {
    source: ["lib/**/*.ts"],
    shared: [],
    unit_tests: ["spec/**/*.spec.ts"],
    bdd_features: ["bdd/**/*.feature"],
    bdd_steps: ["bdd/steps/**"],
    docs: ["README.md", "docs/**"],
    spec: "REQS.md",
    design: [],
    progress: "state/progress.json",
  },
  commands: { bdd: "run-bdd", unit: "run-unit", typecheck: "run-types", format: "run-format", lint: null, coverage: "run-coverage", extra_checks: ["run-extra"] },
});

describe("profileFor", () => {
  it("grants each step its tools and its paths from the project's configuration, and a shell only to the steps that implement or debug", () => {
    expect(CYCLE_STATES).toEqual(["FEATURE_WRITE", "BDD_RED", "TDD_RED", "CODE_GREEN", "REFACTOR", "FR_REFACTOR", "QUALITY_FIX"]);
    const tools = ["read", "grep", "find", "ls", "write", "edit"];

    const features = profileFor("FEATURE_WRITE", config);
    expect(features).toMatchObject({ builtins: tools, shell: false, write: ["bdd/**/*.feature"], commands: [] });
    expect(features.read).toEqual(expect.arrayContaining(["REQS.md", "DOMAIN.md", "bdd/**/*.feature"]));

    const steps = profileFor("BDD_RED", config);
    expect(steps).toMatchObject({ builtins: tools, shell: false, write: ["bdd/steps/**"] });
    expect(steps.read).toEqual(expect.arrayContaining(["bdd/**/*.feature", "bdd/steps/**", "DOMAIN.md"]));

    const tests = profileFor("TDD_RED", config);
    expect(tests).toMatchObject({ builtins: tools, shell: false, write: ["spec/**/*.spec.ts"] });
    expect(tests.read).toEqual(expect.arrayContaining(["spec/**/*.spec.ts", "bdd/**/*.feature", "bdd/steps/**"]));
    expect(tests.read).not.toContain("**");

    for (const state of ["CODE_GREEN", "REFACTOR"] as const) {
      expect(profileFor(state, config)).toMatchObject({
        builtins: [...tools, "bash"],
        shell: true,
        write: ["lib/**/*.ts"],
        read: ["**"],
        commands: ["run-unit", "run-bdd", "run-types", "run-format", "run-extra"],
      });
    }
    for (const state of ["FR_REFACTOR", "QUALITY_FIX"] as const) {
      expect(profileFor(state, config)).toMatchObject({ shell: true, write: ["lib/**/*.ts", "README.md", "docs/**"] });
    }
  });

  it("denies every step the files only the orchestrator writes", () => {
    for (const state of CYCLE_STATES) {
      const { deny } = profileFor(state, config);
      expect(deny).toEqual(
        expect.arrayContaining(["state/progress.json", "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "**/tsconfig*.json", "vitest.config.*", "cucumber.*", ".outside-in*", ".outside-in*/**", ".git", ".git/**"]),
      );
    }
  });
});

describe("profileFor deny list", () => {
  it("denies every package manager's manifest and lockfile to every step", () => {
    for (const state of CYCLE_STATES) {
      expect(profileFor(state, config).deny).toEqual(expect.arrayContaining(["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]));
    }
  });
});
