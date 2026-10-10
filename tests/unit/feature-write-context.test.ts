import { describe, expect, it } from "vitest";
import { featureWriteContext } from "../../src/agents/context/task-context.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("the context of a feature-writing task", () => {
  it("holds the requirement, the non-functional requirements, the domain notes and the existing feature files, and no code", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("SPEC.md", "# Spec\n\n### FR-A-01: One\n\nDoes one thing.\n\n### FR-A-02: Two\n\nDoes two things.\n\n### NFR-01: Fast\n\nIt is fast.\n");
    write("DOMAIN.md", "A basket is a list.\n");
    write("features/a-01.feature", "@FR-A-01\nFeature: One\n");
    write("src/one.ts", "export const secretCode = 1;\n");
    const context = featureWriteContext(dir, { fr: "FR-A-02" });
    expect(context).toContain("### FR-A-02: Two\n\nDoes two things.");
    expect(context).toContain("### NFR-01: Fast\n\nIt is fast.");
    expect(context).toContain("A basket is a list.");
    expect(context).toContain("@FR-A-01\nFeature: One");
    expect(context).not.toContain("secretCode");
    expect(context).not.toContain("Does one thing.");
  });

  it("lists the design notes of the project by path and tells the agent to search them for the terms of the requirement, without their text", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: ["SPEC.md", "docs/design.md", "docs/missing.md"], progress: "progress.json" } });
    write("SPEC.md", "### FR-A-02: Two\n\nDoes two things.\n");
    write("docs/design.md", "The option --retries sets the attempts.\n");
    const context = featureWriteContext(dir, { fr: "FR-A-02" });
    expect(context).toContain("Design notes (search these files for the terms of the requirement with your read and grep tools):\n\n- SPEC.md\n- docs/design.md");
    expect(context).not.toContain("docs/missing.md");
    expect(context).not.toContain("--retries");
  });
});
