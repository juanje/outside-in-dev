import { describe, expect, it } from "vitest";
import { oidConfigDir } from "../../src/artifacts/user-config.js";

describe("oidConfigDir", () => {
  it("is OID_CONFIG_DIR when it is set, before XDG_CONFIG_HOME and HOME", () => {
    expect(oidConfigDir({ HOME: "/home/ana", XDG_CONFIG_HOME: "/xdg", OID_CONFIG_DIR: "/srv/oid" })).toBe("/srv/oid");
  });

  it("is oid under XDG_CONFIG_HOME when OID_CONFIG_DIR is not set", () => {
    expect(oidConfigDir({ HOME: "/home/ana", XDG_CONFIG_HOME: "/xdg" })).toBe("/xdg/oid");
  });

  it("is .config/oid under the user's home when neither is set", () => {
    expect(oidConfigDir({ HOME: "/home/ana" })).toBe("/home/ana/.config/oid");
  });
});
