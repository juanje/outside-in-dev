import { describe, expect, it } from "vitest";
import { guardSteps, STEPS_LIMIT } from "../../src/orchestrator/guard-steps.js";
import { COMMANDS, PATHS } from "./bdd-gate-fixture.js";
import { committedRepo } from "./git-fixture.js";
import { useTempDir, write } from "./temp-project.js";

useTempDir();

const repo = () =>
  committedRepo("project", {
    ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: PATHS, commands: COMMANDS }),
    "features/steps/old.steps.ts": "// old\n",
    "src/cart.ts": "export const cart = 1;\n",
  });

describe("the step definitions shown with a scenario that passes before any code", () => {
  it("shows each step file the agent wrote or changed since the scenario started with its code, leaves the other files out, and cuts what is longer than the limit", () => {
    const project = repo();
    expect(guardSteps(project, "HEAD")).toBe("(the agent wrote no step definitions)");
    write("project/features/steps/old.steps.ts", "// old, changed\n");
    write("project/features/steps/new.steps.ts", `Then("nothing is invoked", function () {});\n${"x".repeat(STEPS_LIMIT)}`);
    write("project/src/other.ts", "export const other = 2;\n");
    const shown = guardSteps(project, "HEAD");
    expect(shown).toContain("features/steps/old.steps.ts:\n// old, changed");
    expect(shown).toContain('features/steps/new.steps.ts:\nThen("nothing is invoked"');
    expect(shown).toContain("(rest left out)");
    expect(shown).not.toContain("other.ts");
    expect(shown.length).toBeLessThan(STEPS_LIMIT + 300);
  });
});
