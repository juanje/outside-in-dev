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

  it("gives three examples of the same area as the requirement, the nearest first, and lists the paths of all the feature files", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("SPEC.md", "### FR-A-04: Four\n\nDoes four things.\n");
    for (const [name, tag, marker] of [["a-01", "FR-A-01", "MARK-A01"], ["a-02", "FR-A-02", "MARK-A02"], ["a-03", "FR-A-03", "MARK-A03"], ["a-05", "FR-A-05", "MARK-A05"], ["b-01", "FR-B-01", "MARK-B01"]] as const) write(`features/${name}.feature`, `@${tag}\nFeature: ${marker}\n`);
    const context = featureWriteContext(dir, { fr: "FR-A-04" });
    for (const example of ["MARK-A03", "MARK-A05", "MARK-A02"]) expect(context).toContain(example);
    for (const left of ["MARK-A01", "MARK-B01"]) expect(context).not.toContain(left);
    expect(context).toContain("All the feature files of the project (read any of them with your read tool):\n\n- features/a-01.feature\n- features/a-02.feature\n- features/a-03.feature\n- features/a-05.feature\n- features/b-01.feature");
  });

  it("shows a spread of the feature files when the area of the requirement has none, and never the file of the requirement itself", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("SPEC.md", "### FR-C-01: One\n\nDoes one thing.\n");
    for (const name of ["b-01", "b-02", "b-03", "b-04", "b-05"]) write(`features/${name}.feature`, `@FR-B-0${name.slice(-1)}\nFeature: MARK-${name}\n`);
    write("features/c-01.feature", "@FR-C-01\nFeature: MARK-OWN\n");
    const context = featureWriteContext(dir, { fr: "FR-C-01" });
    const shown = context.slice(context.indexOf("Example feature files, for style:"), context.indexOf("All the feature files of the project"));
    for (const example of ["MARK-b-01", "MARK-b-03", "MARK-b-05"]) expect(shown).toContain(example);
    for (const left of ["MARK-b-02", "MARK-b-04", "MARK-OWN"]) expect(shown).not.toContain(left);
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
