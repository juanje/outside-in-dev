import { describe, expect, it } from "vitest";
import { loadCommandTimeoutS } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadCommandTimeoutS", () => {
  it("defaults to 600 seconds without a configuration file", () => {
    expect(loadCommandTimeoutS(dir)).toBe(600);
  });

  it("defaults to 600 seconds when the configuration sets no command timeout", () => {
    writeMinimalConfig({ limits: { max_inner_iterations: 2 } });
    expect(loadCommandTimeoutS(dir)).toBe(600);
  });

  it("takes the limit from limits.command_timeout_s", () => {
    writeMinimalConfig({ limits: { command_timeout_s: 3 } });
    expect(loadCommandTimeoutS(dir)).toBe(3);
  });
});
