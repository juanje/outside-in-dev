import { describe, expect, it } from "vitest";
import { loadComplexityLimits } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadComplexityLimits", () => {
  it("defaults to a cyclomatic complexity of 10 and a nesting depth of 4 without a configuration file", () => {
    expect(loadComplexityLimits(dir)).toEqual({ max_cyclomatic: 10, max_depth: 4 });
  });

  it("takes a limit from .outside-in.json and keeps the default of the one left out", () => {
    writeMinimalConfig({ refactor: { detectors: { complexity: { max_cyclomatic: 3 } } } });
    expect(loadComplexityLimits(dir)).toEqual({ max_cyclomatic: 3, max_depth: 4 });
  });
});
