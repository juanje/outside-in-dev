import { describe, expect, it } from "vitest";

const CATALOGUE = { getModel: (provider: string, id: string) => (provider === "anthropic" && id.startsWith("claude") ? { provider, id } : undefined) };

describe("formatCheck", () => {
  it("writes the status, the subject and the note on one line, and leaves out an empty note", async () => {
    const { formatCheck } = await import("../../src/commands/setup-checks.js");
    expect(formatCheck({ status: "missing", subject: "tool tsc", note: "install it" })).toBe("missing: tool tsc: install it");
    expect(formatCheck({ status: "ok", subject: "tool git", note: "" })).toBe("ok: tool git");
  });
});

describe("connectChecks", () => {
  it("calls the first model of each provider once, reports an error stop with its message, and removes the secrets from the message", async () => {
    const { connectChecks } = await import("../../src/commands/setup-checks.js");
    const called: string[] = [];
    const runtime = {
      getModel: (provider: string, id: string) => ({ provider, id }),
      completeSimple: async (model: { provider: string; id: string }) => {
        called.push(`${model.provider}/${model.id}`);
        return model.provider === "anthropic" ? { stopReason: "error", errorMessage: "401 invalid key sk-secret-1 for sk-secret-2" } : { stopReason: "stop" };
      },
    };
    const models = { fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", strong: "openrouter/x/y" };
    const checks = await connectChecks(models, ["anthropic", "openrouter"], runtime, ["sk-secret-1", "sk-secret-2"]);
    expect(called).toEqual(["anthropic/claude-haiku-4-5", "openrouter/x/y"]);
    expect(checks).toEqual([
      { status: "failed", subject: "connect anthropic", note: "401 invalid key [hidden] for [hidden]" },
      { status: "ok", subject: "connect openrouter", note: "answered" },
    ]);
  });
});

describe("credentialChecks", () => {
  it("asks Pi once for each provider the roles use, and says where the credential comes from or which command stores one", async () => {
    const { credentialChecks } = await import("../../src/commands/setup-checks.js");
    const asked: string[] = [];
    const auth = { checkAuth: async (provider: string) => (asked.push(provider), provider === "anthropic" ? { source: "ANTHROPIC_API_KEY", type: "api_key" as const } : undefined) };
    const checks = await credentialChecks({ fast: "anthropic/claude-haiku-4-5", default: "anthropic/claude-sonnet-4-5", spec: "openrouter/anthropic/claude-opus-5" }, auth);
    expect(asked).toEqual(["anthropic", "openrouter"]);
    expect(checks).toEqual([
      { status: "ok", subject: "credential for anthropic", note: "ANTHROPIC_API_KEY" },
      { status: "missing", subject: "credential for openrouter", note: "run oid setup --provider openrouter --api-key-stdin (or --login at a terminal), or set the provider's environment variable" },
    ]);
  });
});

describe("modelChecks", () => {
  it("is ok for a model in the catalogue, names the fix for a required role without a model and for a model the catalogue lacks, and skips an optional role with none", async () => {
    const { modelChecks } = await import("../../src/commands/setup-checks.js");
    const checks = modelChecks({ fast: "anthropic/claude-haiku-4-5", strong: "anthropic/no-such-model" }, CATALOGUE);
    expect(checks).toEqual([
      { status: "ok", subject: "model fast", note: "anthropic/claude-haiku-4-5" },
      { status: "missing", subject: "model default", note: "not assigned; run oid setup" },
      { status: "missing", subject: "model strong", note: '"anthropic/no-such-model" is not in Pi\'s catalogue; run oid setup --model strong=provider/id' },
    ]);
  });
});
