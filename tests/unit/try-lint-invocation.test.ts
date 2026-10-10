import { describe, expect, it } from "vitest";
import { lintInvocation } from "../../src/artifacts/lint-tools.js";
import { dir, useTempDir, write } from "./temp-project.js";

useTempDir();

describe("lintInvocation", () => {
  it("appends the files, quoted, to a linter oid does not recognise", () => {
    expect(lintInvocation(dir, "mylint --strict", ["src/a.ts", "src/it's.ts"])).toBe("mylint --strict 'src/a.ts' 'src/it'\\''s.ts'");
  });

  it("passes the files to the script after `--` when the linter is an npm script, with the flags of the tool the script runs", () => {
    write("package.json", JSON.stringify({ scripts: { lint: "eslint src", check: "mylint" } }));
    expect(lintInvocation(dir, "npm run lint", ["src/a.ts"])).toBe("npm run lint -- --format json 'src/a.ts'");
    expect(lintInvocation(dir, "npm run check", ["src/a.ts"])).toBe("npm run check -- 'src/a.ts'");
  });
});
