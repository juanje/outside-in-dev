import { describe, expect, it } from "vitest";
import { loadRefactorEntry } from "../../src/artifacts/project-config.js";
import { dir, useTempDir, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("loadRefactorEntry", () => {
  it("is empty without a configuration file", () => {
    expect(loadRefactorEntry(dir)).toEqual([]);
  });

  it("lists the entry points of refactor.entry in .outside-in.json", () => {
    writeMinimalConfig({ refactor: { entry: ["src/worker.ts"] } });
    expect(loadRefactorEntry(dir)).toEqual(["src/worker.ts"]);
  });
});
