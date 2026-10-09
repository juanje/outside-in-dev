import { describe, expect, it } from "vitest";
import { output, scriptedTerminal } from "./scripted-terminal.js";

describe("terminalInteraction", () => {
  it("asks a secret at the hidden prompt, text and codes at the open one, and a choice by its number", async () => {
    const { terminalInteraction } = await import("../../src/commands/setup-interactive.js");
    const terminal = scriptedTerminal(["sk-hidden", "visible text", "code-123", "2"]);
    const interaction = terminalInteraction(output().io, terminal);
    expect(await interaction.prompt({ type: "secret", message: "Enter the API key" })).toBe("sk-hidden");
    expect(await interaction.prompt({ type: "text", message: "Account id" })).toBe("visible text");
    expect(await interaction.prompt({ type: "manual_code", message: "Paste the code" })).toBe("code-123");
    expect(await interaction.prompt({ type: "select", message: "Which plan", options: [{ id: "free", label: "Free" }, { id: "pro", label: "Pro" }] })).toBe("pro");
    expect(terminal.hidden).toEqual(["Enter the API key: "]);
  });

  it("refuses to ask a secret at a terminal that cannot hide what is typed, and points to the piped key", async () => {
    const { terminalInteraction } = await import("../../src/commands/setup-interactive.js");
    const interaction = terminalInteraction(output().io, { line: async () => "never asked" });
    await expect(interaction.prompt({ type: "secret", message: "Enter the API key" })).rejects.toThrow("--api-key-stdin");
  });

  it("shows the addresses, the device codes and the messages that a login gives", async () => {
    const { terminalInteraction } = await import("../../src/commands/setup-interactive.js");
    const { io, text } = output();
    const interaction = terminalInteraction(io, scriptedTerminal([]));
    interaction.notify({ type: "auth_url", url: "https://login.example.test/a", instructions: "Sign in and copy the code" });
    interaction.notify({ type: "device_code", userCode: "WXYZ-1234", verificationUri: "https://login.example.test/device" });
    interaction.notify({ type: "info", message: "Opening the browser", links: [{ url: "https://docs.example.test/login", label: "Help" }] });
    interaction.notify({ type: "progress", message: "Waiting for the browser" });
    for (const shown of ["https://login.example.test/a", "Sign in and copy the code", "WXYZ-1234", "https://login.example.test/device", "Opening the browser", "https://docs.example.test/login", "Waiting for the browser"]) {
      expect(text()).toContain(shown);
    }
  });
});
