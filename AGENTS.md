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
| The test you must make pass                                         | `features/*.feature` |
| Vocabulary, data formats, how Pi, cucumber and vitest really behave | `DOMAIN.md`          |
| Why a decision was made; what is already settled                    | `DECISIONS.md`       |
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

- **The spec is the source of truth.** If you think a requirement is wrong or contradicts another, stop and ask. Do not silently diverge, and do not edit `SPEC.md`, `DOMAIN.md` or `DECISIONS.md` without being asked.
- **One feature at a time.** Do not start the next FR until the current one is done.
- **Settled decisions stay settled.** Do not reopen a decision in `DECISIONS.md`; propose a new entry if you think one is wrong.
- **English everywhere** in code, comments, docs and prompts. Prompts and agent-facing text contain no examples in other languages. Test data may use other languages.
- **Commit after each feature**, referencing the FR: `feat(<area>): FR-AREA-NN <title>`. Use `test(...)`, `fix(...)`, `refactor(...)`, `docs:` and `chore:` for the rest.
- **Spikes are the only exception to test-first.** They live in `spikes/<name>/`, are never imported by `src/`, record their conclusions in `DECISIONS.md` and are deleted afterwards.
- **Run oid from an installed build, never from this working tree.** The code being changed is not the code that runs the process.



## Traps

- **Pi's** `prompt()` **resolves even when the provider failed.** Check `stopReason` on `message_end`. Same for `classify()`.
- `tools` **and** `customTools` **must come from one array.** A custom tool missing from the allowlist is never offered, with no error.
- **A step file that statically imports something that does not exist yet stops cucumber-js before any scenario runs.** Import not-yet-implemented source dynamically inside the step.
- **cucumber-js 13 has no** `json` **or** `junit` **formatter.** Use `--format message:<file>`.
- **vitest reports a missing export as** `TypeError: (0 , name) is not a function`**, not as an import error.**
- **Always pass oid's** `agentDir` **to Pi.** Otherwise Pi reads the user's personal settings.

`DOMAIN.md` has the details.