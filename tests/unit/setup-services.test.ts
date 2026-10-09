import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

/** A standard input and output that are, or are not, a terminal. */
function streams(isTTY: boolean) {
  const stdin = Object.assign(new PassThrough(), { isTTY });
  const stdout = Object.assign(new PassThrough(), { isTTY });
  return { stdin, stdout };
}

describe("setupServices with a terminal for input only", () => {
  it("has no person to ask, and no standard input to read, since a key typed at a terminal would be shown", async () => {
    const { setupServices } = await import("../../src/commands/setup-services.js");
    const stdin = Object.assign(new PassThrough(), { isTTY: true });
    const services = setupServices({ HOME: "/home/ana" }, stdin, Object.assign(new PassThrough(), { isTTY: false }));
    expect(services.input).toEqual({ isTTY: false });
    expect(services.readStdin).toBeUndefined();
  });
});

describe("setupServices", () => {
  it("finds the configuration directory, oid's agent directory and the agent directory of Pi in the environment", async () => {
    const { setupServices } = await import("../../src/commands/setup-services.js");
    const { stdin, stdout } = streams(false);
    expect(setupServices({ HOME: "/home/ana" }, stdin, stdout)).toMatchObject({ configDir: "/home/ana/.config/oid", agentDir: "/home/ana/.config/oid/agent", piAgentDir: "/home/ana/.pi/agent" });
    expect(setupServices({ HOME: "/home/ana", OID_CONFIG_DIR: "/srv/oid", OID_AGENT_DIR: "/srv/agent", PI_CODING_AGENT_DIR: "/srv/pi" }, stdin, stdout)).toMatchObject({ configDir: "/srv/oid", agentDir: "/srv/agent", piAgentDir: "/srv/pi" });
  });

  it("reads standard input when it is piped, and offers a terminal when both ends are one", async () => {
    const { setupServices } = await import("../../src/commands/setup-services.js");
    const piped = streams(false);
    const services = setupServices({ HOME: "/home/ana" }, piped.stdin, piped.stdout);
    piped.stdin.end("sk-piped-key\n");
    expect(services.input).toEqual({ isTTY: false });
    expect(await services.readStdin!()).toBe("sk-piped-key\n");
    const terminal = streams(true);
    const interactive = setupServices({ HOME: "/home/ana" }, terminal.stdin, terminal.stdout);
    expect(interactive.input.isTTY).toBe(true);
    expect(interactive.readStdin).toBeUndefined();
  });
});
