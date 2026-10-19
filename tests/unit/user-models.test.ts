import { describe, expect, it } from "vitest";
import { loadUserEffort, loadUserModels } from "../../src/artifacts/user-config.js";
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

describe("loadUserEffort", () => {
  it("takes the effort of each state from config.json, with no problem", () => {
    write("config.json", JSON.stringify({ effort: { FEATURE_WRITE: { thinking: "high" }, BDD_RED: { thinking: "high", model: "strong" } } }));
    expect(loadUserEffort(dir)).toEqual({ effort: { FEATURE_WRITE: { thinking: "high" }, BDD_RED: { thinking: "high", model: "strong" } }, problems: [] });
  });

  it("has no effort and no problem without a config.json or without the key", () => {
    expect(loadUserEffort(dir)).toEqual({ effort: {}, problems: [] });
    write("config.json", JSON.stringify({ models: {} }));
    expect(loadUserEffort(dir)).toEqual({ effort: {}, problems: [] });
  });

  it("reports a state that has no effort, naming it", () => {
    write("config.json", JSON.stringify({ effort: { CODE_BLUE: { thinking: "high" } } }));
    const { effort, problems } = loadUserEffort(dir);
    expect(effort).toEqual({});
    expect(problems).toHaveLength(1);
    expect(problems[0]!.state).toBe("CODE_BLUE");
  });

  it("reports a level that does not exist, naming the state and the level", () => {
    write("config.json", JSON.stringify({ effort: { BDD_RED: { thinking: "extreme" } } }));
    const { effort, problems } = loadUserEffort(dir);
    expect(effort).toEqual({});
    expect(problems).toHaveLength(1);
    expect(problems[0]!.state).toBe("BDD_RED");
    expect(problems[0]!.note).toContain("extreme");
  });

  it("reports a model role that does not exist, naming the state and the role", () => {
    write("config.json", JSON.stringify({ effort: { BDD_RED: { thinking: "high", model: "huge" } } }));
    const { problems } = loadUserEffort(dir);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.state).toBe("BDD_RED");
    expect(problems[0]!.note).toContain("huge");
  });
});
