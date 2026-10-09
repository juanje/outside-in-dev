import { describe, expect, it } from "vitest";
import { fakeSetupSdk } from "./fake-setup-sdk.js";
import { setup } from "./setup-fixture.js";
import { useTempDir } from "./temp-project.js";

useTempDir();

describe("oid setup without a terminal", () => {
  it("says what to pass when it is given nothing to do", async () => {
    const rejected = setup([]);
    await expect(rejected).rejects.toThrow("--api-key-stdin");
    await expect(rejected).rejects.toThrow("--model");
  });

  it("refuses a login, which needs a browser and someone to use it, and logs in to nothing", async () => {
    const { sdk, calls } = fakeSetupSdk(["anthropic"]);
    await expect(setup(["--provider", "anthropic", "--login"], { sdk })).rejects.toThrow("terminal");
    expect(calls.logins).toEqual([]);
  });
});
