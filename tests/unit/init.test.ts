import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/run-cli.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oid-init-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runInit() {
  let stdout = "";
  let stderr = "";
  const exitCode = runCli(["init"], {
    cwd: dir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

function writeProject(file: string, content: string) {
  writeFileSync(join(dir, file), content);
}

function readConfig() {
  return JSON.parse(readFileSync(join(dir, ".outside-in.json"), "utf8"));
}

describe("oid init", () => {
  it("refuses a project that is not TypeScript", () => {
    const { exitCode, stderr } = runInit();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("only TypeScript projects are supported");
  });

  it("writes the default configuration for a project with a tsconfig.json", () => {
    writeProject("tsconfig.json", "{}");
    const { exitCode } = runInit();
    expect(exitCode).toBe(0);
    expect(readConfig()).toEqual({
      version: 1,
      stack: "typescript",
      paths: {
        source: ["src/**"],
        shared: [],
        unit_tests: ["tests/unit/**"],
        bdd_features: ["features/**/*.feature"],
        bdd_steps: ["features/steps/**", "features/support/**"],
        docs: ["README.md", "docs/**"],
        spec: "SPEC.md",
        design: ["SPEC.md", "DOMAIN.md", "DECISIONS.md"],
        progress: "progress.json",
      },
      commands: {
        bdd: 'NODE_OPTIONS="--import tsx" npx cucumber-js',
        unit: "npx vitest run",
        typecheck: "npx tsc --noEmit",
        format: null,
        lint: null,
        coverage: null,
        extra_checks: [],
      },
    });
  });

  it.each(["dependencies", "devDependencies"])("recognises TypeScript from %s in package.json", (section) => {
    writeProject("package.json", JSON.stringify({ [section]: { typescript: "5.0.0" } }));
    const { exitCode } = runInit();
    expect(exitCode).toBe(0);
    expect(readConfig().stack).toBe("typescript");
  });

  it("takes the source paths from the include entries of tsconfig.json", () => {
    writeProject("tsconfig.json", JSON.stringify({ include: ["lib/**/*.ts", "app/**/*.ts"] }));
    runInit();
    expect(readConfig().paths.source).toEqual(["lib/**/*.ts", "app/**/*.ts"]);
  });

  it("reads a tsconfig.json with comments and trailing commas", () => {
    writeProject("tsconfig.json", '{\n // c\n "compilerOptions": {}, /* b */\n "include": ["lib/**/*.ts",],\n}');
    const { exitCode } = runInit();
    expect(exitCode).toBe(0);
    expect(readConfig().paths.source).toEqual(["lib/**/*.ts"]);
  });

  it("reports a tsconfig.json that is not plain JSON and writes nothing", () => {
    writeProject("tsconfig.json", '{ "include": ["src/**"]');
    const { exitCode, stderr } = runInit();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("tsconfig.json is not valid JSON");
    expect(existsSync(join(dir, ".outside-in.json"))).toBe(false);
  });

  it("takes the unit test paths from the include array of the vitest configuration", () => {
    writeProject("tsconfig.json", "{}");
    writeProject(
      "vitest.config.ts",
      `import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["spec/**/*.spec.ts", 'more/**/*.test.ts'],
    passWithNoTests: true,
  },
});
`,
    );
    runInit();
    expect(readConfig().paths.unit_tests).toEqual(["spec/**/*.spec.ts", "more/**/*.test.ts"]);
  });

  it.each(["vitest.config.mts", "vitest.config.js", "vitest.config.mjs"])("also reads %s", (file) => {
    writeProject("tsconfig.json", "{}");
    writeProject(file, 'export default { test: { include: ["spec/**"] } };');
    runInit();
    expect(readConfig().paths.unit_tests).toEqual(["spec/**"]);
  });

  it("takes the feature and step paths from paths and import in the cucumber configuration", () => {
    writeProject("tsconfig.json", "{}");
    writeProject(
      "cucumber.mjs",
      `export default {
  paths: ["specs/**/*.feature"],
  import: ["specs/steps/**/*.ts", "specs/support/**/*.ts"],
};
`,
    );
    runInit();
    expect(readConfig().paths.bdd_features).toEqual(["specs/**/*.feature"]);
    expect(readConfig().paths.bdd_steps).toEqual(["specs/steps/**/*.ts", "specs/support/**/*.ts"]);
  });

  it("reads the quoted keys of a cucumber.json", () => {
    writeProject("tsconfig.json", "{}");
    writeProject("cucumber.json", JSON.stringify({ paths: ["specs/**/*.feature"], import: ["specs/steps/**"] }));
    runInit();
    expect(readConfig().paths.bdd_features).toEqual(["specs/**/*.feature"]);
    expect(readConfig().paths.bdd_steps).toEqual(["specs/steps/**"]);
  });

  it.each(["cucumber.js", "cucumber.cjs"])("also reads %s", (file) => {
    writeProject("tsconfig.json", "{}");
    writeProject(file, 'module.exports = { paths: ["specs/**/*.feature"] };');
    runInit();
    expect(readConfig().paths.bdd_features).toEqual(["specs/**/*.feature"]);
  });

  it("takes the step paths from require when the cucumber configuration has no import", () => {
    writeProject("tsconfig.json", "{}");
    writeProject("cucumber.cjs", 'module.exports = { require: ["specs/steps/**/*.ts"] };');
    runInit();
    expect(readConfig().paths.bdd_steps).toEqual(["specs/steps/**/*.ts"]);
  });

  it("takes the commands from the scripts of package.json", () => {
    writeProject("tsconfig.json", "{}");
    writeProject("package.json", JSON.stringify({ scripts: { unit: "vitest run", pretty: "prettier --check ." } }));
    runInit();
    expect(readConfig().commands).toMatchObject({
      unit: "npm run unit",
      format: "npm run pretty",
      lint: null,
      coverage: null,
      extra_checks: [],
    });
  });

  it("adds .outside-in/ to the .gitignore, creating it when needed", () => {
    writeProject("tsconfig.json", "{}");
    runInit();
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe(".outside-in/\n");
    rmSync(join(dir, ".outside-in.json"));
    writeProject(".gitignore", "dist/");
    runInit();
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("dist/\n.outside-in/\n");
  });

  it("says the .gitignore already ignores .outside-in/ instead of claiming to add it, and leaves the file alone", () => {
    writeProject("tsconfig.json", "{}");
    writeProject(".gitignore", "dist/\n.outside-in\n");
    const { stdout } = runInit();
    expect(stdout).toContain(".gitignore already ignores .outside-in/");
    expect(stdout).not.toContain("added .outside-in/");
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("dist/\n.outside-in\n");
  });

  it("refuses when .outside-in.json already exists and changes nothing", () => {
    writeProject("tsconfig.json", "{}");
    writeProject(".outside-in.json", '{ "hand": "edited" }');
    const { exitCode, stderr } = runInit();
    expect(exitCode).toBe(1);
    expect(stderr).toContain(".outside-in.json already exists");
    expect(readFileSync(join(dir, ".outside-in.json"), "utf8")).toBe('{ "hand": "edited" }');
    expect(existsSync(join(dir, ".gitignore"))).toBe(false);
  });

  it("writes the configuration as two-space JSON ending in one newline", () => {
    writeProject("tsconfig.json", "{}");
    runInit();
    const raw = readFileSync(join(dir, ".outside-in.json"), "utf8");
    expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
  });

  it("prints what it detected and wrote", () => {
    writeProject("tsconfig.json", JSON.stringify({ include: ["lib/**"] }));
    const { stdout } = runInit();
    expect(stdout).toContain("typescript");
    expect(stdout).toContain("lib/**");
    expect(stdout).toContain(".outside-in.json");
    expect(stdout).toContain(".gitignore");
  });

  it("creates progress.json with every FR of SPEC.md as a pending feature, in order", () => {
    writeProject("tsconfig.json", "{}");
    writeProject(
      "SPEC.md",
      "### NFR-01: Speed\n\nFast.\n\n### FR-A-02: Second\n\nText.\n\n### FR-A-01: First\n\nText.\n",
    );
    const { exitCode } = runInit();
    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "progress.json"), "utf8"))).toEqual({
      current_focus: null,
      features: [
        { id: "FR-A-02", title: "Second", status: "pending" },
        { id: "FR-A-01", title: "First", status: "pending" },
      ],
    });
  });

  it("leaves an existing progress.json untouched and says so", () => {
    writeProject("tsconfig.json", "{}");
    writeProject("SPEC.md", "### FR-A-01: First\n\nText.\n");
    const existing = '{ "current_focus": null, "features": [] }\n';
    writeProject("progress.json", existing);
    const { exitCode, stdout } = runInit();
    expect(exitCode).toBe(0);
    expect(readFileSync(join(dir, "progress.json"), "utf8")).toBe(existing);
    expect(stdout).toContain("progress.json already exists");
  });

  it("creates no progress.json and says so when there is no SPEC.md", () => {
    writeProject("tsconfig.json", "{}");
    const { exitCode, stdout } = runInit();
    expect(exitCode).toBe(0);
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
    expect(stdout).toContain("SPEC.md not found");
  });

  it("reports a duplicate FR id, creates no progress.json and keeps the configuration", () => {
    writeProject("tsconfig.json", "{}");
    writeProject("SPEC.md", "### FR-A-01: First\n\nText.\n\n### FR-A-01: Again\n\nText.\n");
    const { exitCode, stderr } = runInit();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("FR-A-01");
    expect(stderr).toContain("duplicate ID");
    expect(stderr).toContain(".outside-in.json was written");
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
    expect(readConfig().stack).toBe("typescript");
  });

  it("reports an empty FR title and creates no progress.json", () => {
    writeProject("tsconfig.json", "{}");
    writeProject("SPEC.md", "### FR-A-01:\n\nText.\n");
    const { exitCode, stderr } = runInit();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("FR-A-01: empty title");
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });

  it("detects a specification kept in specs/ and puts the progress file and design documents beside it", () => {
    writeProject("tsconfig.json", "{}");
    mkdirSync(join(dir, "specs"));
    writeProject("specs/SPEC.md", "### FR-A-01: First\n\nText.\n");
    runInit();
    const { paths } = readConfig();
    expect(paths.spec).toBe("specs/SPEC.md");
    expect(paths.progress).toBe("specs/progress.json");
    expect(paths.design).toEqual(["specs/SPEC.md", "specs/DOMAIN.md", "specs/DECISIONS.md"]);
  });

  it("creates the progress file beside a specification kept in specs/", () => {
    writeProject("tsconfig.json", "{}");
    mkdirSync(join(dir, "specs"));
    writeProject("specs/SPEC.md", "### FR-A-01: First\n\nText.\n");
    runInit();
    expect(JSON.parse(readFileSync(join(dir, "specs/progress.json"), "utf8")).features[0].id).toBe("FR-A-01");
    expect(existsSync(join(dir, "progress.json"))).toBe(false);
  });
});
