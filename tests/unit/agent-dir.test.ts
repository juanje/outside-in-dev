import { describe, expect, it } from "vitest";
import { oidAgentDir } from "../../src/agents/runner.js";

describe("oidAgentDir", () => {
  it("is .config/oid/agent under the user's home when OID_AGENT_DIR is not set", () => {
    expect(oidAgentDir({ HOME: "/home/ana" })).toBe("/home/ana/.config/oid/agent");
  });

  it("is OID_AGENT_DIR when it is set", () => {
    expect(oidAgentDir({ HOME: "/home/ana", OID_AGENT_DIR: "/srv/oid-agent" })).toBe("/srv/oid-agent");
  });
});
