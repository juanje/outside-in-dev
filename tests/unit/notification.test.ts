import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAgent } from "../../features/support/fake-agent.js";
import { runCli } from "../../src/run-cli.js";
import { approvedRun, loopProject } from "./loop-fixture.js";
import { featureProject, runServices, stepsProject } from "./feature-cycle-fixture.js";
import { gitIn } from "./git-fixture.js";
import { useTempDir, REAL_PROCESS_TIMEOUT_MS } from "./temp-project.js";

useTempDir();

function cartAgent(): FakeAgent {
  const agent = new FakeAgent();
  agent.testRoute.rounds.push({ files: [{ path: "tests/unit/cart.test.ts", content: "// the test\n" }], test: "tests/unit/cart.test.ts > cart > adds" });
  agent.codeRoute.rounds.push({ files: [{ path: "src/cart.ts", content: "export const cart = 1;\n" }] });
  return agent;
}

describe("configured notifications", () => {
  it("uses done as the event when a run finishes", async () => {
    const project = loopProject();
    const record = join(project, "notifications.ndjson");
    const configFile = join(project, ".outside-in.json");
    const config = JSON.parse(readFileSync(configFile, "utf8")) as { settings?: Record<string, unknown> };
    config.settings = { ...config.settings, notify_command: "node notify.mjs" };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(project, "notify.mjs"), [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(record)}, JSON.stringify({ event: process.env.OID_EVENT, message: process.env.OID_MESSAGE }) + "\\n");`,
      "",
    ].join("\n"));
    gitIn(project, "add", ".outside-in.json", "notify.mjs");
    gitIn(project, "commit", "--quiet", "--message", "configure notifications");

    await approvedRun(project, cartAgent(), ["run", "--fr", "FR-A-01"]);

    const [notification] = readFileSync(record, "utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(notification).toMatchObject({ event: "done", message: expect.stringContaining("FR-A-01") });
  }, REAL_PROCESS_TIMEOUT_MS);

  it("describes the finished feature in the done notification message", async () => {
    const project = loopProject();
    const record = join(project, "notifications.ndjson");
    const configFile = join(project, ".outside-in.json");
    const config = JSON.parse(readFileSync(configFile, "utf8")) as { settings?: Record<string, unknown> };
    config.settings = { ...config.settings, notify_command: "node notify.mjs" };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(project, "notify.mjs"), [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(record)}, process.env.OID_MESSAGE + "\\n");`,
      "",
    ].join("\n"));
    gitIn(project, "add", ".outside-in.json", "notify.mjs");
    gitIn(project, "commit", "--quiet", "--message", "configure notifications");

    await approvedRun(project, cartAgent(), ["run", "--fr", "FR-CART-02"]);

    const message = readFileSync(record, "utf8").trim();
    expect(message).toMatch(/FR-CART-02/);
    expect(message).toMatch(/finish|complete|done/i);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("calls the finished feature out explicitly in the done notification", async () => {
    const project = loopProject();
    const record = join(project, "notifications.ndjson");
    const configFile = join(project, ".outside-in.json");
    const config = JSON.parse(readFileSync(configFile, "utf8")) as { settings?: Record<string, unknown> };
    config.settings = { ...config.settings, notify_command: "node notify.mjs" };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(project, "notify.mjs"), [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(record)}, process.env.OID_MESSAGE + "\\n");`,
      "",
    ].join("\n"));
    gitIn(project, "add", ".outside-in.json", "notify.mjs");
    gitIn(project, "commit", "--quiet", "--message", "configure notifications");

    await approvedRun(project, cartAgent(), ["run", "--fr", "FR-A-01"]);

    expect(readFileSync(record, "utf8").trim()).toMatch(/finished feature.*FR-A-01/i);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("uses error as the event when a run fails without a unit test", async () => {
    const project = stepsProject();
    const record = join(project, "notifications.ndjson");
    const configFile = join(project, ".outside-in.json");
    const config = JSON.parse(readFileSync(configFile, "utf8")) as { limits?: Record<string, unknown>; settings?: Record<string, unknown> };
    config.limits = { ...config.limits, max_retries: 0 };
    config.settings = { ...config.settings, notify_command: "node notify.mjs" };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(project, "notify.mjs"), [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(record)}, JSON.stringify({ event: process.env.OID_EVENT, message: process.env.OID_MESSAGE }) + "\\n");`,
      "",
    ].join("\n"));
    gitIn(project, "add", ".outside-in.json", "notify.mjs");
    gitIn(project, "commit", "--quiet", "--message", "configure error notifications");

    const { exitCode } = await approvedRun(project, new FakeAgent(), ["run", "--fr", "FR-A-01"]);

    const notification = JSON.parse(readFileSync(record, "utf8").trim()) as { event: string; message: string };
    expect(exitCode).toBe(1);
    expect(notification.event).toBe("error");
    expect(notification.message).toContain("the report names no unit test");
    expect(notification.message).toContain("failed");
  }, REAL_PROCESS_TIMEOUT_MS);

  it("warns when a notification command does not exist after a run finishes", async () => {
    const project = loopProject();
    const configFile = join(project, ".outside-in.json");
    const config = JSON.parse(readFileSync(configFile, "utf8")) as { settings?: Record<string, unknown> };
    config.settings = { ...config.settings, notify_command: "no-such-notifier" };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    gitIn(project, "add", ".outside-in.json");
    gitIn(project, "commit", "--quiet", "--message", "configure missing notification");

    let output = "";
    await runCli(
      ["run", "--fr", "FR-CART-02"],
      { cwd: project, stdout: (text) => (output += text), stderr: (text) => (output += text) },
      runServices(cartAgent().sdk, { isTTY: true, choose: async () => "approve", line: async () => "" }),
    );

    expect(output).toMatch(/notification command.*could not be run/i);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("warns when a notification fails while waiting for a human answer", async () => {
    const project = featureProject();
    const configFile = join(project, ".outside-in.json");
    const config = JSON.parse(readFileSync(configFile, "utf8")) as { settings?: Record<string, unknown> };
    config.settings = { ...config.settings, notify_command: "node notify.mjs" };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(project, "notify.mjs"), "process.exit(7);\n");
    gitIn(project, "add", ".outside-in.json", "notify.mjs");
    gitIn(project, "commit", "--quiet", "--message", "install failing notification");

    let output = "";
    const exitCode = await runCli(
      ["run"],
      { cwd: project, stdout: (text) => (output += text), stderr: (text) => (output += text) },
      runServices(cartAgent().sdk, { isTTY: false }),
    );

    expect(exitCode).toBe(3);
    expect(output).toMatch(/notification command.*(?:fail|exit|code)/i);
  }, REAL_PROCESS_TIMEOUT_MS);

  it("notifies when the inner loop rejects a missing unit test", async () => {
    const project = loopProject();
    const record = join(project, "notifications.ndjson");
    const configFile = join(project, ".outside-in.json");
    const config = JSON.parse(readFileSync(configFile, "utf8")) as { limits?: Record<string, unknown>; settings?: Record<string, unknown> };
    config.limits = { ...config.limits, max_retries: 0 };
    config.settings = { ...config.settings, notify_command: "node notify.mjs" };
    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(project, "notify.mjs"), [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(record)}, JSON.stringify({ event: process.env.OID_EVENT, message: process.env.OID_MESSAGE }) + "\\n");`,
      "",
    ].join("\n"));
    gitIn(project, "add", ".outside-in.json", "notify.mjs");
    gitIn(project, "commit", "--quiet", "--message", "configure error notifications");

    const agent = cartAgent();
    agent.testRoute.rounds = [];
    const { exitCode } = await approvedRun(project, agent, ["run", "--fr", "FR-A-02"]);

    const notification = JSON.parse(readFileSync(record, "utf8").trim()) as { event: string; message: string };
    expect({ exitCode, event: notification.event, message: notification.message }).toEqual({
      exitCode: 1,
      event: "error",
      message: expect.stringContaining("the report names no unit test"),
    });
  }, REAL_PROCESS_TIMEOUT_MS);
});
