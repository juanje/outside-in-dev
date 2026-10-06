import { describe, expect, it } from "vitest";
import { loadMagicValueLimits } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadMagicValueLimits", () => {
  it("defaults to ignoring 0, 1 and -1 and to 3 string repeats without a configuration file", () => {
    expect(loadMagicValueLimits(dir)).toEqual({ ignore: [0, 1, -1], min_string_repeats: 3 });
  });

  it("takes a limit from .outside-in.json and keeps the default of the one left out", () => {
    writeMinimalConfig({ refactor: { detectors: { magic_value: { ignore: [0, 1, -1, 100] } } } });
    expect(loadMagicValueLimits(dir)).toEqual({ ignore: [0, 1, -1, 100], min_string_repeats: 3 });
  });
});
