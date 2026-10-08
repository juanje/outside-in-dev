import { join } from "node:path";
import { BDD_SCRIPT, UNIT_SCRIPT } from "./suite-scripts.js";
import { gitIn } from "./git-fixture.js";
import { dir, write } from "./temp-project.js";

const PATHS = { source: ["src/**"], shared: [], unit_tests: [], bdd_features: [], bdd_steps: [], docs: [], spec: "SPEC.md", design: [], progress: "progress.json" };
const COMMANDS = { bdd: "node bdd.cjs", unit: "node unit.cjs", typecheck: "t", format: null, lint: null, coverage: null, extra_checks: [] };

/** A committed git project whose suite runners report the given statuses, with two features of the given status (pending by default); returns its path. */
export function committedRunProject(statuses: { unit: string; bdd: string } = { unit: "passed", bdd: "PASSED" }, featureStatus = "pending"): string {
  const files: Record<string, string> = {
    ".outside-in.json": JSON.stringify({ version: 1, stack: "typescript", paths: PATHS, commands: COMMANDS }),
    ".gitignore": ".outside-in/\n",
    "SPEC.md": "# Spec\n\n## Functional Requirements\n\n### FR-A-01: One\n\nDoes one thing.\n\n### FR-A-02: Two\n\nDoes another.\n",
    "progress.json": JSON.stringify({ current_focus: null, features: ["FR-A-01", "FR-A-02"].map((id) => ({ id, title: id, status: featureStatus })) }),
    "unit.cjs": UNIT_SCRIPT(statuses.unit),
    "bdd.cjs": BDD_SCRIPT(statuses.bdd),
  };
  for (const [name, text] of Object.entries(files)) write(`project/${name}`, text);
  const repo = join(dir, "project");
  gitIn(repo, "init", "--quiet", "--initial-branch", "main");
  gitIn(repo, "config", "user.name", "Fixture");
  gitIn(repo, "config", "user.email", "fixture@example.com");
  gitIn(repo, "config", "gc.auto", "0");
  gitIn(repo, "config", "maintenance.auto", "false");
  gitIn(repo, "add", "-A");
  gitIn(repo, "commit", "--quiet", "--message", "fixture");
  return repo;
}
