import { describe, expect, it } from "vitest";
import { loadUserModels } from "../../src/artifacts/user-config.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("loadUserModels", () => {
  it("takes the models from config.json of the configuration directory", () => {
    write("config.json", JSON.stringify({ models: { fast: "p/small", default: "p/medium", strong: "p/large", spec: "p/spec" } }));
    expect(loadUserModels(dir)).toEqual({ fast: "p/small", default: "p/medium", strong: "p/large", spec: "p/spec" });
  });

  it("has no models when the user has no config.json", () => {
    expect(loadUserModels(dir)).toBeUndefined();
  });
});
