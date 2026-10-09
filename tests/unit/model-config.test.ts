import { describe, expect, it } from "vitest";
import { loadProjectConfig } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("the models key of .outside-in.json", () => {
  it("is refused with an error that names oid setup", () => {
    writeMinimalConfig({ models: { fast: "p/small", default: "p/medium", strong: "p/large" } });
    expect(() => loadProjectConfig(dir)).toThrow(/models.*oid setup/s);
  });
});
