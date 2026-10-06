import { describe, expect, it } from "vitest";
import { isOutsideInIgnored, withOutsideInIgnored } from "../../src/artifacts/project-setup.js";

describe("withOutsideInIgnored", () => {
  it("creates the content of a new .gitignore", () => {
    expect(withOutsideInIgnored(undefined)).toBe(".outside-in/\n");
  });

  it("appends the entry to an existing .gitignore, ending a last line that has no newline", () => {
    expect(withOutsideInIgnored("node_modules/\ndist/\n")).toBe("node_modules/\ndist/\n.outside-in/\n");
    expect(withOutsideInIgnored("node_modules/")).toBe("node_modules/\n.outside-in/\n");
  });

  it("starts the content of an empty .gitignore with the entry, without a blank line", () => {
    expect(withOutsideInIgnored("")).toBe(".outside-in/\n");
  });

  it.each([".outside-in/", ".outside-in"])("leaves a .gitignore that already has %s unchanged", (line) => {
    const gitignore = `node_modules/\n${line}\ndist/\n`;
    expect(withOutsideInIgnored(gitignore)).toBe(gitignore);
  });
});

describe("isOutsideInIgnored", () => {
  it.each([".outside-in/", ".outside-in", "  .outside-in/  "])("recognises the equivalent line %j", (line) => {
    expect(isOutsideInIgnored(`dist/\n${line}\n`)).toBe(true);
  });

  it("is false for a missing or unrelated .gitignore", () => {
    expect(isOutsideInIgnored(undefined)).toBe(false);
    expect(isOutsideInIgnored("")).toBe(false);
    expect(isOutsideInIgnored("dist/\n.outside-in-old/\n")).toBe(false);
  });
});
