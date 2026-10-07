import { describe, expect, it } from "vitest";
import { loadProjectConfig } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadProjectConfig", () => {
  it("reads the project's configuration and refuses a project without one or with an invalid one", () => {
    writeMinimalConfig();
    expect(loadProjectConfig(dir).commands.unit).toBe("u");
    expect(loadProjectConfig(dir).paths.source).toEqual(["src/**"]);
    write(".outside-in.json", "{}");
    expect(() => loadProjectConfig(dir)).toThrow("invalid");
  });

  it("names the missing file", () => {
    expect(() => loadProjectConfig(dir)).toThrow(".outside-in.json");
  });
});
