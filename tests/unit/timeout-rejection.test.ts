import { describe, expect, it } from "vitest";
import { renderRejection } from "../../src/artifacts/rejection.js";
import { CommandTimeoutError } from "../../src/artifacts/verify-runner.js";
import { rejectingTimeout } from "../../src/orchestrator/command-timeout.js";

describe("rejectingTimeout", () => {
  it("turns a command that passed its limit into a rejection that names the command and the limit", () => {
    const judged = rejectingTimeout(() => {
      throw new CommandTimeoutError("npm run test:unit", 30);
    });
    const text = renderRejection(judged as Parameters<typeof renderRejection>[0]);
    expect(text).toContain("npm run test:unit");
    expect(text).toContain("limits.command_timeout_s");
    expect(text).toContain("30 s");
    expect(text).toContain("Next:");
  });
});
