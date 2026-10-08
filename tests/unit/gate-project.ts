import { loadProjectConfig, type ProjectConfig } from "../../src/artifacts/project-config.js";
import { GATE_PATHS } from "./gate-paths.js";
import { dir, write } from "./temp-project.js";

/** A command that fails and leaves a marker, so that a test can tell the gate ran a check it should have stopped before. */
const BOOM = "node boom.cjs";
export const MARKER = "ran.txt";

type Commands = ProjectConfig["commands"];

/** A project for the checks of the quality gate: `commands` replace the ones that fail and leave a marker, `files` are written beside the specification (one requirement, no feature file). Returns its configuration; the project is the temporary directory. */
export function gateProject(commands: Partial<Commands>, files: Record<string, string> = {}): ProjectConfig {
  const all: Commands = { bdd: BOOM, unit: BOOM, typecheck: BOOM, format: null, lint: null, coverage: null, extra_checks: [], ...commands };
  write(".outside-in.json", JSON.stringify({ version: 1, stack: "typescript", paths: GATE_PATHS, commands: all }));
  write("SPEC.md", "### FR-X-01: Alpha\n\nThe tool does alpha.\n");
  write("boom.cjs", `require("node:fs").writeFileSync("${MARKER}", "ran");\nprocess.exit(9);\n`);
  for (const [file, text] of Object.entries(files)) write(file, text);
  return loadProjectConfig(dir);
}

/** The baseline of a run that held nothing. */
export const EMPTY_BASELINE = { lint: [], types: [], traceability: [] };

const PASSED = { name: "<cwd>/tests/unit/cart.test.ts", message: "", assertionResults: [{ fullName: "cart adds", title: "adds", status: "passed", failureMessages: [] }] };

/** A unit runner whose report holds one test that passes. */
export const PASSING_UNIT = `const out = process.argv.find((arg) => arg.startsWith("--outputFile=")).slice(13);\nrequire("node:fs").writeFileSync(out, JSON.stringify({ testResults: [${JSON.stringify(PASSED)}] }).replaceAll("<cwd>", process.cwd()));\n`;

/** A BDD runner whose Cucumber Messages report is `report`, and whose exit code is `exitCode`. */
export function bddRunner(report: string, exitCode: number): string {
  return `const out = process.argv[process.argv.indexOf("--format") + 1].slice("message:".length);\nrequire("node:fs").writeFileSync(out, ${JSON.stringify(report)});\nprocess.exit(${exitCode});\n`;
}
