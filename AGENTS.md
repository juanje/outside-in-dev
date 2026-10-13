# oid

`oid` is a command-line harness that enforces the Outside-In Development methodology (Spec → BDD → TDD) on AI coding agents. It is being built with that same methodology: first by agents guided by this file, then, step by step, by oid itself.

**This file says how to work here. It does not say what to work on.** `progress.json` owns that.

## Methodology

This project follows the Outside-In (Spec → BDD → TDD) methodology.
Read `docs/METHODOLOGY.md` before any implementation work.
Start every session by checking current progress (see `docs/METHODOLOGY.md`, "Session start").
Never write implementation code without a failing test.
Never skip the quality gate before committing.

## Where things are


| Need                                                                | File                 |
| ------------------------------------------------------------------- | -------------------- |
| What is open, what is next                                          | `progress.json`      |
| What to build and why (FRs, NFRs)                                   | `SPEC.md`            |
| How to write features, steps, tests and code here                   | `docs/CONVENTIONS.md`|
| The test you must make pass                                         | `features/*.feature` |
| Vocabulary, data formats, how Pi, cucumber and vitest really behave | `DOMAIN.md`          |
| The decisions in force, and why                                     | `DECISIONS.md`       |
| Full technical design (states, gates, profiles, config)             | `docs/design.md`     |
| How oid is being bootstrapped, and which phase we are in            | `docs/BOOTSTRAP.md`  |




## Quality gate (all of it, before every commit)

```
npx tsc --noEmit
npm run test:unit
npm run test:bdd
oid check
oid metrics --changed
```

`oid check` and `oid metrics` are the installed build. Both run as a git pre-commit hook: install it with `cp scripts/pre-commit .git/hooks/pre-commit`. `oid metrics --changed` fails only on new findings on the lines changed since the last commit; existing ones are in the local baseline (`oid metrics --baseline`, once per clone). CI runs `oid check` only: after the commit there are no changed lines to judge.

## Rules

- **The spec binds the feature; it is not frozen.** While you work on a feature, follow `SPEC.md`, `docs/design.md` and `DECISIONS.md`, and never diverge from them on your own. Do not edit `SPEC.md`, `DOMAIN.md`, `DECISIONS.md` or `docs/design.md` without being asked.
- **A design that looks wrong is a finding, not an obstacle.** If a requirement, a design section, an ADR or the article contradicts another or the code, stop and propose the change, with the evidence. The human decides; the change then follows "Changing the design" in `docs/METHODOLOGY.md` (ADR-054). Do not work around it.
- **One feature at a time.** Do not start the next FR until the current one is done.
- **An ADR is not ignored or quietly edited.** If you think one is wrong, propose the change; once the human agrees, the ADR is rewritten or replaced, never amended by a second entry (ADR-054).
- **English everywhere** in code, comments, docs and prompts. Prompts and agent-facing text contain no examples in other languages. Test data may use other languages.
- **Commit after each feature**, referencing the FR: `feat(<area>): FR-AREA-NN <title>`. Use `test(...)`, `fix(...)`, `refactor(...)`, `docs:` and `chore:` for the rest.
- **Spikes are the only exception to test-first.** They live in `spikes/<name>/`, are never imported by `src/`, record their conclusions in `DECISIONS.md` and are deleted afterwards.
- **Run oid from an installed build, never from this working tree.** The code being changed is not the code that runs the process.



## Traps

Writing features, steps, tests or code: `docs/CONVENTIONS.md` holds the rules, the same ones oid's own agents receive (dynamic imports in steps, Pi's traps, run scenarios that assert milestones, real runners and replays, never rewriting a failing test). The ones below are about driving the cycle.

- **Read progress with** `oid progress current`**,** `status` **and** `show`**.** Do not parse `progress.json`.
- **Do not stash, move or revert files to fabricate a Red or to satisfy integrity.** A wrong step or unit test once the code exists goes back to `bdd_red` or `tdd_red` (ADR-038, ADR-044); with no legal move, stop (ADR-045). Both are in `docs/METHODOLOGY.md`.
- **Do not chain an edit and** `oid verify` **or** `oid progress step` **in the same shell call.** The hook blocks the whole call.
- **A requirement that changed, so that the passing scenarios no longer describe it, is** `oid progress revise`**, run by the human.** Do not add another FR for it. The exit to `quality_gate` when no code is needed is the orchestrating session's, with no override (ADR-046).
- **A review or a bug on a** `done` **feature whose passing scenarios still describe it is** `oid progress reopen`**, run by you.** The new `done` goes in the same commit as the fix.
- **Subagents never override.** `OID_OVERRIDE="<cause>"` is for the orchestrating session only, as the last resort (ADR-045); a subagent with no legal move stops and reports. An edit the step does not allow goes with the override that absorbs it.
