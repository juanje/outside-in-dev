import { describe, expect, it } from "vitest";
import { toolInvocation } from "../../src/artifacts/lint-tools.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("the invocation of the project's formatter and linter", () => {
  it("adds the flags of the tool it recognises, looks inside an npm script, and leaves a tool it does not recognise as it is", () => {
    write("package.json", JSON.stringify({ scripts: { lint: "eslint src", style: "prettier .", other: "tidy-tool src" } }));
    expect(toolInvocation(dir, "npx eslint src", "fix")).toBe("npx eslint src --fix");
    expect(toolInvocation(dir, "npx eslint src", "check")).toBe("npx eslint src --format json");
    expect(toolInvocation(dir, "prettier .", "fix")).toBe("prettier . --write");
    expect(toolInvocation(dir, "prettier .", "check")).toBe("prettier . --check");
    expect(toolInvocation(dir, "npm run lint", "fix")).toBe("npm run lint -- --fix");
    expect(toolInvocation(dir, "npm run style", "check")).toBe("npm run style -- --check");
    expect(toolInvocation(dir, "npm run other", "check")).toBe("npm run other");
    expect(toolInvocation(dir, "tidy-tool src", "fix")).toBe("tidy-tool src");
  });
});
