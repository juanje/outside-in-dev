import { describe, expect, it } from "vitest";
import { output, scriptedTerminal } from "./scripted-terminal.js";

const NAMES = ["anthropic/claude-haiku-4-5", "anthropic/claude-sonnet-4-5", "anthropic/claude-opus-5", "openrouter/anthropic/claude-opus-5"];
const catalogue = {
  getModel: (provider: string, id: string) => (NAMES.includes(`${provider}/${id}`) ? { provider, id } : undefined),
  getModels: () => NAMES.map((name) => ({ provider: name.split("/")[0]!, id: name.slice(name.indexOf("/") + 1) })),
};

describe("askModels", () => {
  it("asks for the model of each role in turn and returns the ones answered; an empty answer keeps the current model or skips the optional role", async () => {
    const { askModels } = await import("../../src/commands/setup-interactive.js");
    const terminal = scriptedTerminal(["", "anthropic/claude-sonnet-4-5", "anthropic/claude-opus-5", ""]);
    const { io } = output();
    const models = await askModels(io, terminal, catalogue, { fast: "anthropic/claude-haiku-4-5" });
    expect(models).toEqual({ default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5" });
    expect(terminal.asked.map((question) => question.toLowerCase())).toEqual([
      expect.stringContaining("fast model"),
      expect.stringContaining("default model"),
      expect.stringContaining("strong model"),
      expect.stringContaining("spec model"),
    ]);
    expect(terminal.asked[0]).toContain("anthropic/claude-haiku-4-5");
  });

  it("asks again for a required role that has no model yet when the answer is empty", async () => {
    const { askModels } = await import("../../src/commands/setup-interactive.js");
    const terminal = scriptedTerminal(["", "anthropic/claude-haiku-4-5", "anthropic/claude-sonnet-4-5", "anthropic/claude-opus-5", ""]);
    const { io, text } = output();
    const models = await askModels(io, terminal, catalogue, {});
    expect(models).toEqual({ fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5" });
    expect(text()).toContain("the fast role needs a model");
  });

  it("lists the models of the catalogue that match an answer that is not a provider/id, and asks again", async () => {
    const { askModels } = await import("../../src/commands/setup-interactive.js");
    const terminal = scriptedTerminal(["OPUS", "anthropic/claude-opus-5", "", "", ""]);
    const { io, text } = output();
    const models = await askModels(io, terminal, catalogue, { default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5" });
    expect(models).toEqual({ fast: "anthropic/claude-opus-5" });
    expect(text()).toContain("anthropic/claude-opus-5");
    expect(text()).toContain("openrouter/anthropic/claude-opus-5");
    expect(text()).not.toContain("claude-haiku-4-5");
    expect(text()).not.toContain("is not in Pi's catalogue");
  });

  it("lists at most ten matches and says how many more there are", async () => {
    const { askModels } = await import("../../src/commands/setup-interactive.js");
    const many = Array.from({ length: 13 }, (_, at) => `acme/model-${at}`);
    const big = { getModel: (_provider: string, id: string) => (id === "model-1" ? {} : undefined), getModels: () => many.map((name) => ({ provider: "acme", id: name.slice(5) })) };
    const terminal = scriptedTerminal(["model", "acme/model-1", "", "", ""]);
    const { io, text } = output();
    await askModels(io, terminal, big, { default: "x/y", strong: "x/y" });
    expect(text().split("\n").filter((line) => line.includes("acme/model-"))).toHaveLength(10);
    expect(text()).toContain("3 more");
  });

  it("says that a model is not in the catalogue and asks for the role again", async () => {
    const { askModels } = await import("../../src/commands/setup-interactive.js");
    const terminal = scriptedTerminal(["anthropic/no-such-model", "anthropic/claude-haiku-4-5", "", "", ""]);
    const { io, text } = output();
    const models = await askModels(io, terminal, catalogue, { default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5" });
    expect(models).toEqual({ fast: "anthropic/claude-haiku-4-5" });
    expect(text()).toContain("anthropic/no-such-model is not in Pi's catalogue");
    expect(terminal.asked).toHaveLength(5);
  });
});
