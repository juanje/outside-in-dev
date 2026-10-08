import { describe, expect, it } from "vitest";
import { loadInnerIterationLimit } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadInnerIterationLimit", () => {
  it("defaults to 8 iterations for each scenario without a configuration file", () => {
    expect(loadInnerIterationLimit(dir)).toBe(8);
  });

  it("takes the limit from .outside-in.json", () => {
    writeMinimalConfig({ limits: { max_inner_iterations: 2 } });
    expect(loadInnerIterationLimit(dir)).toBe(2);
  });
});
