import type { ProjectConfig } from "./project-config.js";

const DEFAULT_UNIT = "npx vitest run";
const DEFAULT_BDD = 'NODE_OPTIONS="--import tsx" npx cucumber-js';
const DEFAULT_TYPECHECK = "npx tsc --noEmit";

type DetectedCommands = Pick<ProjectConfig["commands"], "unit" | "bdd" | "typecheck" | "format" | "lint">;

/** The first script, in `scripts` order, whose command runs the tool. */
function npmScriptRunning(scripts: Record<string, string>, tool: RegExp): string | undefined {
  const name = Object.keys(scripts).find((candidate) => tool.test(scripts[candidate]!));
  return name === undefined ? undefined : `npm run ${name}`;
}

/** The commands of the project, read from the scripts of its package.json. */
export function detectCommands(scripts: Record<string, string>): DetectedCommands {
  return {
    unit: npmScriptRunning(scripts, /\bvitest\b/) ?? DEFAULT_UNIT,
    bdd: npmScriptRunning(scripts, /\bcucumber-js\b/) ?? DEFAULT_BDD,
    typecheck: npmScriptRunning(scripts, /\btsc --noEmit\b/) ?? DEFAULT_TYPECHECK,
    format: npmScriptRunning(scripts, /\b(prettier|biome format)\b/) ?? null,
    lint: npmScriptRunning(scripts, /\b(eslint|biome (lint|check))\b/) ?? null,
  };
}

const OUTSIDE_IN_ENTRY = ".outside-in/";
const EQUIVALENT_ENTRIES = [OUTSIDE_IN_ENTRY, ".outside-in"];

/** Whether the .gitignore already has a line equivalent to `.outside-in/`. */
export function isOutsideInIgnored(gitignore: string | undefined): boolean {
  return gitignore !== undefined && gitignore.split("\n").some((line) => EQUIVALENT_ENTRIES.includes(line.trim()));
}

/** The content of .gitignore with `.outside-in/` ignored; unchanged when an equivalent line is already there. */
export function withOutsideInIgnored(gitignore: string | undefined): string {
  if (gitignore === undefined || gitignore === "") return `${OUTSIDE_IN_ENTRY}\n`;
  if (isOutsideInIgnored(gitignore)) return gitignore;
  const separator = gitignore.endsWith("\n") ? "" : "\n";
  return `${gitignore}${separator}${OUTSIDE_IN_ENTRY}\n`;
}
