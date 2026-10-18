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

`oid check` and `oid metrics` are the installed build. Both run as a git pre-commit hook: install it with `npm run hooks:install` (Bash may not copy into `.git/`, ADR-055). `oid metrics --changed` fails only on new findings on the lines changed since the last commit; existing ones are in the local baseline (`oid metrics --baseline`, once per clone). CI runs `oid check` only: after the commit there are no changed lines to judge.

## Rules

- **The spec, the design and the ADRs bind the feature; they are not frozen.** Follow them and never diverge on your own. If one looks wrong or contradicts another or the code, stop and propose the change with the evidence; the human decides, and the change follows "Changing the design" in `docs/METHODOLOGY.md` (ADR-054). Do not edit `SPEC.md`, `DOMAIN.md`, `DECISIONS.md` or `docs/design.md` without being asked.
- **One feature at a time.** Do not start the next FR until the current one is done.
- **English everywhere** in code, comments, docs and prompts. Prompts and agent-facing text contain no examples in other languages. Test data may use other languages.
- **Commit after each feature**, referencing the FR: `feat(<area>): FR-AREA-NN <title>`. Use `test(...)`, `fix(...)`, `refactor(...)`, `tune(prompts)` (prompt wording only, `docs/METHODOLOGY.md`), `docs:` and `chore:` for the rest.
- **Spikes are the only exception to test-first.** They live in `spikes/<name>/`, are never imported by `src/`, record their conclusions in `DECISIONS.md` and are deleted afterwards.
- **Run oid from an installed build, never from this working tree.** The code being changed is not the code that runs the process.

## Traps

Writing features, steps, tests or code: `docs/CONVENTIONS.md`, the same rules oid's own agents receive. Moving the cycle: the hooks refuse what is not allowed and say what to do instead; `docs/METHODOLOGY.md` has the moves (returns, revise and reopen, overrides). What no hook catches:

- **Read progress with** `oid progress current`**,** `status` **and** `show`**.** Do not parse `progress.json`.
- **Do not stash, move or revert files to fabricate a Red or to satisfy integrity.** A wrong step or unit test goes back to a Red (ADR-038, ADR-044); with no legal move, stop (ADR-045).
- **Do not chain an edit and** `oid verify` **or** `oid progress step` **in the same shell call.** The hook blocks the whole call.
