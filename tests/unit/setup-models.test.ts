import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { setup } from "./setup-fixture.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("oid setup --model", () => {
  it("refuses a model that is not in the catalogue, naming it, and writes nothing", async () => {
    const rejected = setup(["--model", "fast=anthropic/no-such-model", "--model", "default=anthropic/claude-sonnet-4-5", "--model", "strong=anthropic/claude-opus-5"]);
    await expect(rejected).rejects.toThrow("anthropic/no-such-model");
    expect(existsSync(join(dir, "config"))).toBe(false);
  });

  it("writes the models of the roles to config.json in the configuration directory and logs in to nothing", async () => {
    const { exitCode, calls, configDir } = await setup(["--model", "fast=anthropic/claude-haiku-4-5", "--model", "default=anthropic/claude-sonnet-4-5", "--model", "strong=anthropic/claude-opus-5", "--model", "spec=openrouter/anthropic/claude-opus-5"]);
    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"))).toEqual({
      models: { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5", spec: "openrouter/anthropic/claude-opus-5" },
    });
    expect(calls.logins).toEqual([]);
  });

  it("checks the models against Pi's own catalogue when it is not given another SDK", async () => {
    const { exitCode, configDir } = await setup(["--model", "fast=anthropic/claude-haiku-4-5", "--model", "default=anthropic/claude-sonnet-4-5", "--model", "strong=anthropic/claude-opus-5"], { sdk: undefined });
    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(configDir, "config.json"), "utf8")).models.fast).toBe("anthropic/claude-haiku-4-5");
    await expect(setup(["--model", "fast=anthropic/no-such-model", "--model", "default=anthropic/claude-sonnet-4-5", "--model", "strong=anthropic/claude-opus-5"], { sdk: undefined })).rejects.toThrow("anthropic/no-such-model");
  });

  it("refuses a first setup that leaves required roles without a model, naming them, and writes nothing", async () => {
    await expect(setup(["--model", "fast=anthropic/claude-haiku-4-5"])).rejects.toThrow("default, strong");
    expect(existsSync(join(dir, "config"))).toBe(false);
  });

  it("changes the role it is given and keeps the other roles and whatever else the configuration holds", async () => {
    write("config/config.json", JSON.stringify({ theme: "dark", models: { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-opus-5", decisions: "openrouter/anthropic/claude-opus-5" } }));
    const { configDir } = await setup(["--model", "strong=anthropic/claude-sonnet-4-5"]);
    expect(JSON.parse(readFileSync(join(configDir, "config.json"), "utf8"))).toEqual({
      theme: "dark",
      models: { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "anthropic/claude-sonnet-4-5", decisions: "openrouter/anthropic/claude-opus-5" },
    });
  });
});
