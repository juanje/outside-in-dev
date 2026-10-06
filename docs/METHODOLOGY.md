# Methodology: Outside-In (Spec → BDD → TDD)

The procedure for agents working on this repository while oid is being bootstrapped. It follows the [Outside-In Development](https://ai.juanjeojeda.com/outside-in-development) article; this file adds the commands and TypeScript specifics of this project. As oid's own commands become available, they replace the manual parts below; `docs/BOOTSTRAP.md` records each switch.

## Session start

1. Read the current progress: `oid progress current` (and `oid progress status` for the open features, `--all` for every tracked one).
2. If the user names a feature: make sure it is tracked and focused (`oid progress add` / `focus`; a pending feature starts with `oid progress step FR-… select`).
3. If no feature is named and there is no focus: ask.
4. Continue the focused feature from its `cycle_step`.

## Updating progress

Only through the installed `oid progress` command (`add`, `focus`, `step`, `scenario`, `done`). Never edit `progress.json` by hand, and never run oid from this working tree.

Update it after every step transition.

## The cycle

For each feature, strictly in order. The `cycle_step` value to record is in brackets.

### 1. Select [`select`]

- Read the FR in `SPEC.md` and the NFRs that apply to it.
- If anything is ambiguous or contradicts another requirement, stop and ask.

### 2. BDD Red [`bdd_red`]

- Write `features/<area>-<nn>.feature`, one file per FR, with `@FR-AREA-NN` on the `Feature`. Scenarios describe observable behaviour from the user's side (for oid, the user is someone running `oid` in a terminal or a test project on disk).
- **Stop and show the feature file to the human before writing steps.** Feature files are reviewed once, up front.
- Write step definitions in `features/steps/` with real assertions. No stubs, no pending markers.
- **Import source that does not exist yet dynamically, inside the step** (`const { x } = await import("../../src/…")`). A static import of a missing module stops cucumber-js before any scenario runs.
- Run the scenario: `npm run test:bdd -- features/<file>.feature:<line>`.
- Confirm a **valid Red**: the steps run and fail because the behaviour is missing. "Undefined", "pending", "ambiguous" or a crash before running are not Red.
- From FR-VERIFY on: `oid verify red features/<file>.feature:<line>` decides.

### 3. TDD Red [`tdd_red`]

- Write **one** failing unit test in `tests/unit/` for the next piece of logic the scenario needs.
- Run it: `npm run test:unit -- <file> -t "<name>"`.
- Confirm a valid Red. If it passes, it is not driving anything: delete it or fix it. A `TypeError: (0 , name) is not a function` is a valid Red only if `name` does not exist yet.
- From FR-VERIFY on: `oid verify red "<file> > <name>"` decides.

### 4. TDD Green [`tdd_green`]

- Write the **minimum** code in `src/` to make the test pass. Before writing a new function or constant, check whether one already exists (search the exported symbols of `src/`).
- Do not touch tests in this step.
- Run the whole unit suite and `npx tsc --noEmit`. No new type errors in `src/`, the unit tests or the step definitions.
- From FR-VERIFY on: `oid verify green`.

### 5. Refactor [`refactor`]

Refactor is not optional, but it is bounded:

- Run `oid metrics --changed`: it lists the new findings on the lines changed since the last commit (duplication, complexity, dead code, magic values, documentation drift). Fix **exactly** those, nothing else. Findings that were already in the baseline are left out (`oid metrics --baseline` records it; `.outside-in/` is local).
- Behaviour must not change: the whole suite stays green, and source and tests are never refactored in the same change.
- Do not extract a helper with a single use unless it reduces complexity; a new exported symbol needs at least two references.

Then: scenario still red → back to 3. Scenario green → next scenario (2) or, if all pass, 6.

### 6. Feature refactor and quality gate [`quality_gate`]

- Run `oid metrics --changed` over the whole diff of the feature (tests, steps and docs included) and fix its findings as separate refactor commits or changes.
- Run the full quality gate (`AGENTS.md`). Every check passes, or go back to the step that owns the failure.

### 7. Done

- Mark every scenario `pass` and the feature done (`oid progress done FR-…`; it refuses if any scenario is not passing).
- Commit: `feat(<area>): FR-AREA-NN <title>`.

## Do not

- Write implementation code before a failing test.
- Write a test that already passes.
- Write more code than the current test demands.
- Edit a test while making it pass, or edit an approved feature file.
- Use `.only`, `.skip`, `.todo`, `@ts-ignore`, `@ts-expect-error`, or code that checks whether it runs under test.
- Assert only that something is defined, or only that something does not happen, unless that is really the requirement.
- Treat "the test passes" as done. Done is the full quality gate plus the progress update.

## Spikes

Some questions cannot be answered test-first (does Pi's hook block a call? how does Jev classify a real trace?). For those, and only those listed in `docs/BOOTSTRAP.md`:

- Work in `spikes/<name>/`, never imported by `src/`.
- Time-box the work and write down the question first.
- Record the answer in `DECISIONS.md` (a new or updated ADR) and delete the spike.
