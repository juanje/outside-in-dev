import { describe, expect, it } from "vitest";
import { loadModels } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadModels", () => {
  it("takes the fast, default and strong models from models", () => {
    writeMinimalConfig({ models: { fast: "p/small", default: "p/medium", strong: "p/large" } });
    expect(loadModels(dir)).toEqual({ fast: "p/small", default: "p/medium", strong: "p/large" });
  });
});
