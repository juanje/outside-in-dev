# Methodology: Outside-In (Spec → BDD → TDD)

The procedure for agents working on this repository while oid is being bootstrapped. It follows the [Outside-In Development](https://ai.juanjeojeda.com/outside-in-development) article; this file adds the commands and TypeScript specifics of this project. As oid's own commands become available, they replace the manual parts below; `docs/BOOTSTRAP.md` records each switch.

## Session start

1. Read the current progress: `oid progress current` (and `oid progress status` for the open features, `--all` for every tracked one).
2. If the user names a feature: make sure it is tracked and focused (`oid progress add` / `focus`; a pending feature starts with `oid progress step FR-… select`).
3. If no feature is named and there is no focus: ask.
4. Continue the focused feature from its `cycle_step`.

## Updating progress

Only through the installed `oid progress` command (`add`, `focus`, `unfocus`, `step`, `scenario`, `scenario drop`, `done`). Never edit `progress.json` by hand, and never run oid from this working tree.

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
- Run `oid verify red features/<file>.feature:<line>`. It decides whether the scenario is a **valid Red**: the steps run and fail because the behaviour is missing. "Undefined", "pending", "ambiguous", a crash before running, or a static import of something that does not exist yet are not Red (exit 1).

**Needs a decision (exit 2).** When `oid verify red` cannot classify a failure by itself (a failing assertion on a line that already existed at the last checkpoint, or an error it cannot attribute; an assertion on a line added since is a valid Red, ADR-033), it prints the failure and the questions to answer, and exits 2. Whoever drives the cycle answers them, not the agent that wrote the test: is it the assertion of the new behaviour, failing for the right reason, and does the test check something meaningful? Then `oid verify red "<target>" --decide <class>`, which answers the failure that run recorded without running the test again (refused if any file but `progress.json` changed since: run `oid verify red` again): `business_assertion` or `missing_implementation` for a valid Red, `test_bug` or `environment` otherwise (ADR-030).

**The verify gates the step.** Move forward (`bdd_red` → `tdd_red`, `tdd_red` → `tdd_green`, `tdd_green` → `refactor` or `quality_gate`, `refactor` → `quality_gate`) only after the matching `oid verify` passed for the feature, on the content there is now; going back to a Red needs no verification. A scenario can be named by its location or by its name (`oid verify red "<scenario name>"`, `oid verify green "<name>" <feature>:<line> ...`); `oid verify integrity` reports changes the current step does not allow (source while writing tests, tests while writing code, approved feature files, forbidden patterns). In Claude Code both are enforced by hooks (`.claude/settings.json`, `scripts/claude-hook.mjs`).

**A step that is wrong once the code exists (ADR-038).** Never edit a step at `tdd_green` or `refactor`. Go back with `oid progress step FR-… bdd_red`, fix the step without touching `src/`, and run `oid verify red <feature>:<line>`. If this cycle already has code, oid returns the feature to the step it came from once the scenario passes, `src/` is unchanged, and the scenario fails without this cycle's code (oid checks that itself and restores the code). Without code yet, it is an ordinary Red and the feature moves to `tdd_red`.

**No legal move (ADR-035).** If the cycle leaves you in a step with no allowed move forward (for example, a step definition fixed in `bdd_red` leaves every scenario green, so no Red is possible), do not work around the hooks or mutate the source to force a Red. Stop and say why. The human moves the step with `oid progress step` outside the hook; then run `oid verify green` on the current content, mutation-check any scenario that passed without a Red, and record the intervention in the bootstrap log.

### 3. TDD Red [`tdd_red`]

- Write **one** failing unit test in `tests/unit/` for the next piece of logic the scenario needs.
- Run `oid verify red "<file> > <name>"`. It decides whether the test is a valid Red (exit 0) or not (exit 1). If it passes, it is not driving anything: fix it or delete it.

### 4. TDD Green [`tdd_green`]

- Write the **minimum** code in `src/` to make the test pass. Before writing a new function or constant, check whether one already exists (search the exported symbols of `src/`).
- Do not touch tests in this step.
- Run `oid verify green`: the whole unit suite, the scenarios recorded as `pass` of the feature in focus (and of the features of its targets), and the type check of `src/`. It must say `green: ok`. The scenarios of other features run in the quality gate (step 6, ADR-036). Type errors in the unit tests or the step definitions are not allowed either (`npx tsc --noEmit`).

### 5. Refactor [`refactor`]

Refactor is not optional, but it is bounded:

- Run `oid metrics --changed`: it lists the new findings on the lines changed since the last commit (duplication, complexity, dead code, magic values, documentation drift). Fix **exactly** those, nothing else. Findings that were already in the baseline are left out (`oid metrics --baseline` records it; `.outside-in/` is local).
- Behaviour must not change: the whole suite stays green, and source and tests are never refactored in the same change.
- Do not extract a helper with a single use unless it reduces complexity; a new exported symbol needs at least two references.

Then: scenario still red → back to 3. Scenario green → next scenario (2) or, if all pass, 6.

### 6. Feature refactor and quality gate [`quality_gate`]

- Run `oid metrics --changed` over the whole diff of the feature (tests, steps and docs included) and fix its findings as separate refactor commits or changes.
- Run the full quality gate (`AGENTS.md`). Every check passes, or go back to the step that owns the failure. A gap seen at the gate (a behaviour with no scenario or no test) is a new Red: `oid progress step FR-… bdd_red` or `tdd_red`; the feature file is not edited inside `quality_gate`.
- A scenario of another feature that fails in the gate is a regression of this feature's change: go back to a Red (`oid progress step FR-… bdd_red` or `tdd_red`) and fix it before committing (ADR-036).

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
