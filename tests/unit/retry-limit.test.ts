import { describe, expect, it } from "vitest";
import { loadRetryLimit } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadRetryLimit", () => {
  it("defaults to 3 retries without a configuration file", () => {
    expect(loadRetryLimit(dir)).toBe(3);
  });

  it("takes the limit from limits.max_retries, 0 included", () => {
    writeMinimalConfig({ limits: { max_retries: 0 } });
    expect(loadRetryLimit(dir)).toBe(0);
  });
});
