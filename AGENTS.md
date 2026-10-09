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
- **Read progress with** `oid progress current`**,** `status` **and** `show`**.** Do not parse `progress.json`.
- **Do not stash, move or revert files to fabricate a Red or to satisfy integrity.** Stop (ADR-035). Fixing a wrong step once the code exists is ADR-038, described in `docs/METHODOLOGY.md`.
- **BDD runs in-process.** `@process` goes only on a scenario that needs a real process, never on the `Feature`. Nothing outside `src/cli.ts` reads `process` globals (ADR-028).
- **An** `oid run` **scenario asserts a milestone** (a transition, a checkpoint that exists, data in the session, files), not the exit code, the last line or the final state. A failure that must end on the first attempt sets `limits.max_retries: 0`.
- **One real runner per run state;** the rest replay a recorded report.
- **A replay declares the request it answers** (the test file and name, or the scenario locations) and fails on an unexpected request or an exhausted sequence. An entry answers more than once only with `repeat: true`.
- **The real-runner scenarios are named in** `features/support/real-runners.ts`**,** and a unit test checks that each one exists. Renaming one of them means updating that list.
- **Do not rewrite a test that already fails** (`not.toThrow`, a weaker assertion, a deleted check) so that it fits the code.
- **Do not chain an edit and** `oid verify` **or** `oid progress step` **in the same shell call.** The hook blocks the whole call.
- **A requirement that changes, so that the passing scenarios no longer describe it, is** `oid progress revise`**, run by the human, as is the exit to `quality_gate` when no code is needed.** Do not add another FR for it.
- **A review or a bug on a** `done` **feature whose passing scenarios still describe it is** `oid progress reopen`**, run by you.** The `pass` scenarios stay; the comment picks `tdd_red`, `bdd_red` or staying at `quality_gate`; the new `done` goes in the same commit as the fix.

`DOMAIN.md` has the details.