import { describe, expect, it } from "vitest";
import { loadDuplicationLimits } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadDuplicationLimits", () => {
  it("defaults to 6 lines and 50 tokens without a configuration file", () => {
    expect(loadDuplicationLimits(dir)).toEqual({ min_lines: 6, min_tokens: 50 });
  });

  it("takes a limit from .outside-in.json and keeps the default of the one left out", () => {
    writeMinimalConfig({ refactor: { detectors: { duplication: { min_lines: 3 } } } });
    expect(loadDuplicationLimits(dir)).toEqual({ min_lines: 3, min_tokens: 50 });
  });
});
