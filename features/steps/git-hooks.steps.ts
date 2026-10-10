import { Given, Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../support/run-project.js";
import type { OidWorld } from "../support/world.js";

const EXECUTABLE = 0o755;
/** Where a hook that records its run leaves its mark, next to the project. */
const markOf = (world: OidWorld, hook: string): string => world.path(`hook-${hook}-ran.txt`);

/** Installs a git hook in the fixture's own repository (never in the repository of oid). Written after the fixture's last commit: a later change of the fixture replaces the repository. */
function installHook(world: OidWorld, hook: string, script: string): void {
  writeFileSync(join(world.projectDir, ".git", "hooks", hook), `#!/bin/sh\n${script}\n`, { mode: EXECUTABLE });
}

Given("the project's git hook {string} exits with {int}", function (this: OidWorld, hook: string, code: number) {
  installHook(this, hook, `exit ${code}`);
});

Given("the project's git hook {string} records that it ran", function (this: OidWorld, hook: string) {
  installHook(this, hook, `echo ran > "${markOf(this, hook)}"`);
});

Given("every commit of the project fails", function (this: OidWorld) {
  git(this.projectDir, "config", "commit.gpgsign", "true");
  git(this.projectDir, "config", "gpg.program", "false");
});

Then("the git hook {string} of the project did not run", function (this: OidWorld, hook: string) {
  assert.equal(existsSync(markOf(this, hook)), false, `${hook} ran`);
});
