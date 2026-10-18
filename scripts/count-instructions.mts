// Counts the instructions oid gives its agents: each prompt of src/agents/prompts/ as this repository renders it, and the rules of docs/CONVENTIONS.md.
// The number of instructions is a design value, kept low (ADR-055); docs/METHODOLOGY.md "Adding a rule" uses this count.
// Run: npx tsx scripts/count-instructions.mts. It changes nothing.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..");
const { loadProjectConfig } = await import(join(repo, "src/artifacts/project-config.ts"));
const { profileFor } = await import(join(repo, "src/agents/profiles.ts"));
const { featureWritePrompt } = await import(join(repo, "src/agents/prompts/feature-write.ts"));
const { bddRedPrompt } = await import(join(repo, "src/agents/prompts/bdd-red.ts"));
const { tddRedPrompt } = await import(join(repo, "src/agents/prompts/tdd-red.ts"));
const { codeGreenPrompt } = await import(join(repo, "src/agents/prompts/code-green.ts"));
const { refactorPrompt } = await import(join(repo, "src/agents/prompts/refactor.ts"));
const { qualityFixPrompt } = await import(join(repo, "src/agents/prompts/quality-fix.ts"));

const config = loadProjectConfig(repo);
const profile = (state: string) => profileFor(state, config);
const FR = "FR-X-01";
const prompts: Record<string, string> = {
  FEATURE_WRITE: featureWritePrompt(FR, profile("FEATURE_WRITE")),
  BDD_RED: bddRedPrompt(FR, "features/x.feature:3", profile("BDD_RED")),
  TDD_RED: tddRedPrompt(FR, profile("TDD_RED")),
  CODE_GREEN: codeGreenPrompt(FR, "tests/unit/x.test.ts > x"),
  REFACTOR: refactorPrompt(FR),
  QUALITY_FIX: qualityFixPrompt(FR, "coder-agent"),
};

/** The sentences of a text: each ends at ". ", "? " or "! ", and each line (a numbered step) ends one too. */
const sentences = (text: string) =>
  text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[a-z]/i.test(sentence));

/** A heuristic for a sentence that tells the agent what to do or not to do: an imperative start, or never, must, do not. */
const DIRECTIVE = /^(\d+\.\s*)?(read|write|call|change|check|fix|stop|reuse|use|run|report|keep|make|list|do|don't|never|only|leave|name|give|describe|add|put|start|end|copy|follow|search|look|when|if|before|after)\b|\b(you (must|never|may not|should|do not|don't|only)|never|do not|don't|must)\b/i;

console.log("| Prompt | Words | Sentences | Directives | Numbered steps |");
console.log("|---|---|---|---|---|");
for (const [name, text] of Object.entries(prompts)) {
  const all = sentences(text);
  const directives = all.filter((sentence) => DIRECTIVE.test(sentence)).length;
  const steps = text.split("\n").filter((line) => /^\d+\.\s/.test(line)).length;
  console.log(`| ${name} | ${text.split(/\s+/).length} | ${all.length} | ${directives} | ${steps} |`);
}

const conventions = readFileSync(join(repo, "docs/CONVENTIONS.md"), "utf8");
const isRule = (line: string) => line.startsWith("- **");
const parts = conventions
  .split(/^## /m)
  .slice(1)
  .map((part) => `${part.split("\n")[0]}: ${part.split("\n").filter(isRule).length}`);
console.log(`\ndocs/CONVENTIONS.md: ${conventions.split("\n").filter(isRule).length} rules (${parts.join("; ")})`);
