import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ProgressError } from "./progress.js";

export const SPEC_FILE = "SPEC.md";

const REQUIREMENT_HEADING = /^### (FR-[A-Z][A-Z0-9]*-\d{2,3}|NFR-\d{2,3}):(.*)$/;

export function readRequirementIds(cwd: string): string[] {
  const path = join(cwd, SPEC_FILE);
  if (!existsSync(path)) {
    throw new ProgressError(`${SPEC_FILE} not found in ${cwd}`);
  }
  return parseRequirements(readFileSync(path, "utf8"))
    .map((requirement) => requirement.id)
    .filter((id) => id.startsWith("FR-"));
}

interface SpecViolation {
  id: string;
  kind: string;
}

const HEADING_LEVEL_3_OR_ABOVE = /^#{1,3} /;

interface Requirement {
  id: string;
  title: string;
  body: string[];
}

export function parseRequirements(text: string): Requirement[] {
  const requirements: Requirement[] = [];
  let current: Requirement | undefined;
  for (const line of text.split("\n")) {
    const match = REQUIREMENT_HEADING.exec(line);
    if (match) {
      current = { id: match[1]!, title: match[2]!.trim(), body: [] };
      requirements.push(current);
    } else if (HEADING_LEVEL_3_OR_ABOVE.test(line)) {
      current = undefined;
    } else {
      current?.body.push(line);
    }
  }
  return requirements;
}

const GIVEN_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?Given\b/;
const THEN_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?Then\b/;

const SCENARIO_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?Scenario:/;

function hasAcceptanceCriteria(body: string[]): boolean {
  const given = body.findIndex((line) => GIVEN_LINE.test(line));
  const hasGivenThen = given !== -1 && body.slice(given + 1).some((line) => THEN_LINE.test(line));
  return hasGivenThen || body.some((line) => SCENARIO_LINE.test(line));
}

export function validateSpec(text: string): SpecViolation[] {
  const violations: SpecViolation[] = [];
  const seen = new Set<string>();
  for (const { id, title, body } of parseRequirements(text)) {
    if (title === "") violations.push({ id, kind: "empty title" });
    if (body.every((line) => line.trim() === "")) violations.push({ id, kind: "empty body" });
    if (hasAcceptanceCriteria(body)) violations.push({ id, kind: "acceptance criteria" });
    if (seen.has(id)) violations.push({ id, kind: "duplicate ID" });
    seen.add(id);
  }
  return violations;
}
