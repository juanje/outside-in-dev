import { describe, expect, it } from "vitest";

describe("parseSetupOptions", () => {
  it("reads the provider, the way to get its credential, the import and the models of the roles", async () => {
    const { parseSetupOptions } = await import("../../src/commands/setup-options.js");
    const options = parseSetupOptions(["--provider", "anthropic", "--api-key-stdin", "--import-pi", "--model", "fast=anthropic/claude-haiku-4-5", "--model", "spec=openrouter/anthropic/claude-opus-5"]);
    expect(options).toEqual({
      provider: "anthropic",
      login: false,
      apiKeyStdin: true,
      importPi: true,
      models: { fast: "anthropic/claude-haiku-4-5", spec: "openrouter/anthropic/claude-opus-5" },
    });
  });

  it("refuses an option it does not know, naming it", async () => {
    const { parseSetupOptions } = await import("../../src/commands/setup-options.js");
    expect(() => parseSetupOptions(["--api-key", "sk-x"])).toThrow("unknown option --api-key");
  });

  it("refuses a login together with a key from standard input, and a key without its provider", async () => {
    const { parseSetupOptions } = await import("../../src/commands/setup-options.js");
    expect(() => parseSetupOptions(["--provider", "anthropic", "--login", "--api-key-stdin"])).toThrow("--login or --api-key-stdin");
    expect(() => parseSetupOptions(["--api-key-stdin"])).toThrow("--api-key-stdin needs --provider");
    expect(() => parseSetupOptions(["--login"])).toThrow("--login needs --provider");
  });

  it("refuses an option that lacks its value and a model that is not ROLE=provider/id", async () => {
    const { parseSetupOptions } = await import("../../src/commands/setup-options.js");
    expect(() => parseSetupOptions(["--provider"])).toThrow("--provider needs a value");
    expect(() => parseSetupOptions(["--model", "fast"])).toThrow("--model fast: expected ROLE=provider/id");
    expect(() => parseSetupOptions(["--model", "fast=nothing"])).toThrow("--model fast=nothing: expected ROLE=provider/id");
  });

  it("refuses a role that is not one of the roles and names the roles there are", async () => {
    const { parseSetupOptions } = await import("../../src/commands/setup-options.js");
    expect(() => parseSetupOptions(["--model", "fastest=anthropic/claude-haiku-4-5"])).toThrow(/fastest.*fast, default, strong, spec/);
  });
});
