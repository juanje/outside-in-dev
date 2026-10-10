import { describe, expect, it } from "vitest";
import { featureWritePrompt } from "../../src/agents/prompts/feature-write.js";

describe("the instructions of the agent that writes the feature files", () => {
  it("say who it is and what oid is, give the reason for observable scenarios and for milestones, tag the Feature line, offer no try tool and end with the report", () => {
    const instructions = featureWritePrompt("FR-A-02");
    expect(instructions).toMatch(/^You are a specialist in Behaviour-Driven Development: you write Gherkin feature files that describe, in the language of the user, what a requirement must do\./);
    expect(instructions).toMatch(/A program called oid orchestrates it/);
    expect(instructions).toContain("Write the feature file for FR-A-02. Every scenario will later be turned into an executable test");
    expect(instructions).toMatch(/1\. /);
    expect(instructions).toMatch(/Abstract steps such as "When the system handles it" cannot be turned into a test that proves anything/);
    expect(instructions).toMatch(/Check milestones, not where the whole process ends/);
    expect(instructions).toMatch(/when the feature is not configured, and when the thing it depends on fails/);
    expect(instructions).toContain("Tag the Feature line with @FR-A-02");
    expect(instructions).not.toMatch(/`try`|full test suites/);
    expect(instructions).not.toMatch(/outside-in|vitest|cucumber|tsc/i);
    expect(instructions.trimEnd().split("\n").at(-1)).toMatch(/call the report tool/i);
  });
});
