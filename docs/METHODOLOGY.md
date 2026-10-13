# Methodology: Outside-In (Spec → BDD → TDD)

The procedure for agents working on this repository while oid is being bootstrapped. It follows the [Outside-In Development](https://ai.juanjeojeda.com/outside-in-development) article and adds the commands of this project. How to write features, steps, tests and code here is in `docs/CONVENTIONS.md`; why each rule exists is in `DECISIONS.md`.

## Session start

1. Read the current progress: `oid progress current` (and `oid progress status` for the open features, `--all` for every tracked one).
2. If the user names a feature: make sure it is tracked and focused (`oid progress add` / `focus`; a pending feature starts with `oid progress step FR-… select`).
3. If no feature is named and there is no focus: ask.
4. Continue the focused feature from its `cycle_step`.

## Updating progress

Only through the installed `oid progress` command (`add`, `focus`, `unfocus`, `step`, `scenario`, `scenario drop`, `done`, `reopen`; `revise` is run by the human). Never edit `progress.json` by hand, and never run oid from this working tree.

Update it after every step transition.

## The cycle

For each feature, strictly in order. The `cycle_step` value to record is in brackets.

### 1. Select [`select`]

- Read the FR in `SPEC.md` and the NFRs that apply to it.
- If anything is ambiguous or contradicts another requirement, stop and ask.

### 2. BDD Red [`bdd_red`]

- Write `features/<area>-<nn>.feature`, one file per FR, with `@FR-AREA-NN` on the `Feature`. Scenarios describe observable behaviour from the user's side (for oid, the user is someone running `oid` in a terminal or a test project on disk).
- **Stop and show the feature file to the human before writing steps.** Feature files are reviewed once, up front.
- Write step definitions in `features/steps/` with real assertions, following `docs/CONVENTIONS.md`. No stubs, no pending markers.
- Run `oid verify red features/<file>.feature:<line>`. It decides whether the scenario is a **valid Red**: the steps run and fail because the behaviour is missing. "Undefined", "pending", "ambiguous", a crash before running, or a static import of something that does not exist yet are not Red (exit 1).

**Needs a decision (exit 2).** When `oid verify red` cannot classify a failure by itself, it prints the failure and the questions, and exits 2 (ADR-017). Whoever drives the cycle answers, not the agent that wrote the test: is it the assertion of the new behaviour, failing for the right reason, and does the test check something meaningful? Then `oid verify red "<target>" --decide <class>`: `business_assertion` or `missing_implementation` for a valid Red, `test_bug` or `environment` otherwise. If any file changed since, run `oid verify red` again first.

**The verify gates the step.** Move forward (`bdd_red` → `tdd_red`, `tdd_red` → `tdd_green`, `tdd_green` → `refactor` or `quality_gate`, `refactor` → `quality_gate`) only after the matching `oid verify` passed for the feature, on the content there is now; going back to a Red needs no verification. A scenario can be named by its location or by its name (`oid verify red "<scenario name>"`, `oid verify green "<name>" <feature>:<line> ...`); `oid verify integrity` reports changes the current step does not allow (source while writing tests, tests while writing code, approved feature files, forbidden patterns). In Claude Code both are enforced by hooks (`.claude/settings.json`, `scripts/claude-hook.mjs`).

**A step that is wrong once the code exists (ADR-038).** Never edit a step at `tdd_red`, `tdd_green`, `refactor` or `quality_gate`. Go back with `oid progress step FR-… bdd_red`, fix only the step, and run `oid verify red <feature>:<line>`. oid checks the fix itself and returns the feature to the step it came from, or moves it to `tdd_red` if this cycle has no code yet; if it refuses, it says which condition failed.

**A unit test that is wrong once the code exists (ADR-044).** Never edit a unit test at `tdd_green`, `refactor` or `quality_gate`. Go back with `oid progress step FR-… tdd_red`, fix only the test, and run `oid verify red "<file> > <title>"`. A test that fails is the next Red; a test that passes is judged as a fix, and oid returns the feature to the step it came from or says which condition failed.

**No legal move (ADR-045).** If the cycle leaves you in a step with no allowed move forward, do not work around the hooks or mutate the source to force a Red. A subagent stops and reports to the orchestrating session. The orchestrating session makes the move with an override, `OID_OVERRIDE="<cause>" oid progress step …` or `OID_OVERRIDE="<cause>" oid verify …`, only when no legal move exists, never for what oid checks by itself (a return, a `--decide`). A file the step does not allow is edited only together with the override that absorbs it, whose cause names the edit. Then run `oid verify green`, mutation-check any scenario that passed without a Red, and record each override, with its cause, in the bootstrap log. `oid progress revise` stays the human's.

### 3. TDD Red [`tdd_red`]

- Write **one** failing unit test in `tests/unit/` for the next piece of logic the scenario needs.
- Run `oid verify red "<file> > <name>"`. It decides whether the test is a valid Red (exit 0) or not (exit 1). If it passes, it is not driving anything: fix it or delete it.

### 4. TDD Green [`tdd_green`]

- Write the **minimum** code in `src/` to make the test pass. Before writing a new function or constant, check whether one already exists (search the exported symbols of `src/`).
- Do not touch tests in this step.
- Run `oid verify green`: the whole unit suite, the scenarios recorded as `pass` of the feature in focus (and of the features of its targets), and the type check of the project (source, unit tests and step definitions). It must say `green: ok`. The scenarios of other features run in the quality gate (step 6, ADR-030).

### 5. Refactor [`refactor`]

Refactor is not optional, but it is bounded:

- Run `oid metrics --changed`: it lists the new findings on the lines changed since the last commit (duplication, complexity, dead code, magic values, documentation drift). Fix **exactly** those, nothing else. Findings that were already in the baseline are left out (`oid metrics --baseline` records it; `.outside-in/` is local).
- Behaviour must not change: the whole suite stays green, and source and tests are never refactored in the same change.
- Do not extract a helper with a single use unless it reduces complexity; a new exported symbol needs at least two references.

Then: scenario still red → back to 3. Scenario green → next scenario (2) or, if all pass, 6.

### 6. Feature refactor and quality gate [`quality_gate`]

- Run `oid metrics --changed` over the whole diff of the feature (tests, steps and docs included) and fix its findings, never source and tests in the same change.
- Run the full quality gate (`AGENTS.md`). Every check passes, or go back to the step that owns the failure. A gap seen at the gate (a behaviour with no scenario or no test) is a new Red: `oid progress step FR-… bdd_red` or `tdd_red`; the feature file is not edited inside `quality_gate`.
- A scenario of another feature that fails in the gate is a regression of this feature's change: go back to a Red (`oid progress step FR-… bdd_red` or `tdd_red`) and fix it before committing (ADR-030).

### 7. Done

- Write anything that goes in the commit besides the code (the bootstrap-log row, notes) **before** the last `oid verify green`: `done` refuses if any file changed after the green.
- Mark every scenario `pass` and the feature done (`oid progress done FR-…`; it refuses if any scenario is not passing).
- Commit: `feat(<area>): FR-AREA-NN <title>`.

## Changing a requirement

Which command (ADR-039): do the scenarios that pass still describe the requirement? Yes (a missing case, a bug against the spec, a review comment): `reopen` ("Review after done"), then `oid progress step FR-… bdd_red` for a new scenario. No: `revise`.

When the human decides that a requirement changed, they run `oid progress revise FR-…` in their own terminal (the hook refuses it from the agent). The FR goes back to `bdd_red` with every scenario `pending`. Then: rewrite the FR's section in `SPEC.md` and its feature file, `oid progress scenario drop` the scenarios that no longer describe anything, and run the cycle again to prove what remains. Do not add a second FR for the same intent; git keeps the old one. If what remains needs no code (the scenarios were only removed or moved), run `oid verify green` on all of them; then the orchestrating session runs `oid progress step FR-… quality_gate`, with no override (ADR-041, ADR-046).

## Changing the design

The article and `docs/design.md` are a starting point, and the implementation tests them (ADR-054). When the work shows that a design section, an ADR or the article is wrong, the design changes, through records:

1. **Raise it.** Stop and tell the human what is wrong and the evidence (a failing run, a contradiction, a measurement). A subagent reports it to the orchestrating session. Do not work around it in the code.
2. **The human decides.** Nothing below happens without that decision.
3. **ADR.** In `DECISIONS.md`, rewrite the entry the change touches, or add a new one (context, options, decision, consequences) and remove the entries it replaces. The file holds only what is in force; git keeps the rest. Never reuse a number. A deviation from the article has a title that starts with "Deviation from the article:".
4. **Design.** Update the sections of `docs/design.md` that the ADR changes, so that they describe what is in force.
5. **Spec.** If behaviour changes, update `SPEC.md`. For each FR whose passing scenarios no longer describe it, the human runs `oid progress revise` ("Changing a requirement"); for one whose scenarios still describe it, `reopen`.
6. **Commit.** Steps 3 and 4 go in one `docs:` commit whose message says why, step 5 in that commit too or in the one that follows.

## Review after done

A pull request opens with the feature already `done`. When review comments arrive, the agent runs `oid progress reopen FR-…`: the feature goes back to `quality_gate` and every `pass` stays `pass`. The comment decides the move: a missing behaviour is `oid progress step FR-… tdd_red`; a missing scenario is `oid progress step FR-… bdd_red` (the feature file is not edited at `quality_gate`); a change to code only stays at `quality_gate`. If the tree changed, run `oid verify green` on the feature's scenarios and `oid progress done FR-…`, and commit the `done` together with the fix: a later commit that only changes `progress.json` drops the approvals of the pull request.

## Do not

- Write implementation code before a failing test.
- Write a test that already passes.
- Write more code than the current test demands.
- Edit a test while making it pass, or edit an approved feature file.
- Use `.only`, `.skip`, `.todo`, `@ts-ignore`, `@ts-expect-error`, or code that checks whether it runs under test.
- Assert only that something is defined, or only that something does not happen, unless that is really the requirement.
- Treat "the test passes" as done. Done is the full quality gate plus the progress update.
- Stash, move or revert files to fabricate a Red or to satisfy integrity. Stop and say why (ADR-045).

## Spikes

Some questions cannot be answered test-first (does Pi's hook block a call? how does Jev classify a real trace?). For those, and only those listed in `docs/BOOTSTRAP.md`:

- Work in `spikes/<name>/`, never imported by `src/`.
- Time-box the work and write down the question first.
- Record the answer in `DECISIONS.md` (a new or updated ADR) and delete the spike.
