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

  it("gives three examples that share nothing with the requirement from its own area first, by path, and lists the paths of all the feature files", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("SPEC.md", "### FR-A-04: Four\n\nDoes four things.\n");
    for (const [name, tag, marker] of [["a-01", "FR-A-01", "MARK-A01"], ["a-02", "FR-A-02", "MARK-A02"], ["a-03", "FR-A-03", "MARK-A03"], ["a-05", "FR-A-05", "MARK-A05"], ["b-01", "FR-B-01", "MARK-B01"]] as const) write(`features/${name}.feature`, `@${tag}\nFeature: ${marker}\n`);
    const context = featureWriteContext(dir, { fr: "FR-A-04" });
    for (const example of ["MARK-A01", "MARK-A02", "MARK-A03"]) expect(context).toContain(example);
    for (const left of ["MARK-A05", "MARK-B01"]) expect(context).not.toContain(left);
    expect(context).toContain("All the feature files of the project (read any of them with your read tool):\n\n- features/a-01.feature\n- features/a-02.feature\n- features/a-03.feature\n- features/a-05.feature\n- features/b-01.feature");
  });

  it("shows the first feature files by path when none is of the area of the requirement or shares a term with it, and never the file of the requirement itself", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("SPEC.md", "### FR-C-01: One\n\nDoes one thing.\n");
    for (const name of ["b-01", "b-02", "b-03", "b-04", "b-05"]) write(`features/${name}.feature`, `@FR-B-0${name.slice(-1)}\nFeature: MARK-${name}\n`);
    write("features/c-01.feature", "@FR-C-01\nFeature: MARK-OWN\n");
    const context = featureWriteContext(dir, { fr: "FR-C-01" });
    const shown = context.slice(context.indexOf("Example feature files, for style:"), context.indexOf("All the feature files of the project"));
    for (const example of ["MARK-b-01", "MARK-b-02", "MARK-b-03"]) expect(shown).toContain(example);
    for (const left of ["MARK-b-04", "MARK-b-05", "MARK-OWN"]) expect(shown).not.toContain(left);
  });

  it("chooses the examples by the terms they share with the requirement and with the design passages about it, not by area", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: [], docs: [], spec: "SPEC.md", design: ["docs/design.md"], progress: "progress.json" } });
    write("SPEC.md", "### FR-T-06: Notify\n\nA command runs whenever the run needs a human.\n");
    write("docs/design.md", "The notify_command setting names the command.\n");
    write("features/t-01.feature", "@FR-T-01\nFeature: MARK-T01\n  Scenario: Card\n    When oid draws a card\n");
    write("features/r-01.feature", "@FR-R-01\nFeature: MARK-R01\n  Scenario: Human\n    When the run needs a human\n");
    write("features/r-02.feature", "@FR-R-02\nFeature: MARK-R02\n  Scenario: Command\n    When the notify_command setting names the command\n");
    write("features/t-02.feature", "@FR-T-02\nFeature: MARK-T02\n  Scenario: Box\n    When oid draws a box\n");
    const context = featureWriteContext(dir, { fr: "FR-T-06" });
    const shown = context.slice(context.indexOf("Example feature files, for style:"), context.indexOf("All the feature files of the project"));
    for (const example of ["MARK-R01", "MARK-R02", "MARK-T01"]) expect(shown).toContain(example);
    expect(shown).not.toContain("MARK-T02");
  });

  it("lists the step definitions of the project by file, with the steps of the examples first, and tells why to reuse them", () => {
    writeMinimalConfig({ paths: { source: ["src/**"], shared: [], unit_tests: [], bdd_features: ["features/**/*.feature"], bdd_steps: ["features/steps/**/*.ts"], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" } });
    write("SPEC.md", "### FR-A-02: Two\n\nDoes two things.\n");
    write("features/a-01.feature", "@FR-A-01\nFeature: One\n  Scenario: S\n    Given a basket\n");
    write("features/steps/z.steps.ts", 'Given("a basket", function () { /* BODY-Z */ });\n');
    write("features/steps/a.steps.ts", 'Given("an empty shelf", function () { /* BODY-A */ });\n');
    const context = featureWriteContext(dir, { fr: "FR-A-02" });
    expect(context).toContain("Step definitions that exist");
    expect(context.indexOf('Given("a basket"')).toBeLessThan(context.indexOf('Given("an empty shelf"'));
    expect(context).toContain("### features/steps/z.steps.ts");
    expect(context).not.toContain("BODY-Z");
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
