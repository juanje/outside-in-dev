# Bootstrap roadmap

How oid gets built with its own methodology and takes over its own development (ADR-024): it is developed with Claude Code guided by `AGENTS.md`, and every deterministic piece of oid **replaces a manual part of the process as soon as it exists**. Each phase lists its goal, the work, the exit criteria, and **what changes afterwards**: the switch-overs that make the next phase use what this one built. A phase is not finished until its switch-overs are done.

## Status

| Phase | Milestone | Status |
|:--|:--|:--|
| 0. Repository and design | — | done |
| 1. Spikes | — | S1 and S4 done; S2 moves to phase 4, S3 to phase 3 |
| 2. Deterministic core, dogfooded by replacement | M0 | done |
| 3. Agents and the feature cycle | M1 | in progress |
| 4. Decisions and feature refactor | M2 | — |
| 5. Design phase and periodic cleanup | M3 (closes the MVP) | — |
| After the MVP | M4–M7 | — |

## Releasing a tool build

oid is used on itself from a packed release, never with `npm link` or from the working tree (the code being changed must not be the code that runs):

```
git checkout <tag> && npm ci && npm run build && npm pack
scripts/install-release.sh ./outside-in-dev-<version>.tgz
```

`npm install -g` straight from the tarball would resolve the dependencies again (ADR-052). Keep the previous release directory: if a release misbehaves, reinstall it with `npm install -g <its directory>`.

## Done

- **Phase 0. Repository and design.** The repository, the design documents and the empty quality gate.
- **Phase 1. Spikes.** S1 confirmed Pi's behaviour on provider errors and session transcripts (now in `DOMAIN.md`); S4 settled the code-analysis engine and the detectors' configuration (ADR-027). Two spikes are left for the phases that need them: **S2, Jev on real traces** (does it classify Red failures and refactor findings well enough to be useful, at what latency and cost: 20–30 hand-labelled cases through `classify()`, agreement, latency, cost and the scale of `score` answers), before FR-DEC; and **S3, the terminal interface** (can `pi-tui` give the progress view and the switch to a conversation of design §12.2: a script with fake events, main screen against alternate screen), before FR-TUI-01 and FR-TUI-02.
- **Phase 2. Deterministic core (M0).** `oid progress`, `oid check`, `oid init`, `oid metrics`, `oid verify` and git isolation, each switched into daily work as soon as it existed: progress only through `oid progress`; `oid check` and `oid metrics --changed` in the quality gate and the pre-commit hook; `oid verify` deciding every Red and Green, enforced by the Claude Code hooks in `.claude/settings.json` and `scripts/claude-hook.mjs`.

---

## Phase 3. Agents and the feature cycle (M1)

**Goal.** `oid run` completes a feature end to end on a real project.

**Done.** The agents (FR-AGENT), plain output (FR-TUI-03) and the cycle from start to commit, with retries, resume, abort, budget and the human's options when a state cannot go on (FR-RUN-01 … FR-RUN-11).

**Left, in this order** (the human sets the focus; `progress.json` keeps the specification order):

1. FR-AGENT-10: every rejection says what failed, the evidence and the next action, in a typed shape.
2. Rewrite the unit tests that pin prompt wording (`tests/unit/*-prompt.test.ts`, `fix-at-cause-sentences.ts`) so that they check the mechanism (ADR-057). `test(...)` work, not a feature.
3. FR-RUN-03 and FR-RUN-04, revised by the human (`oid progress revise FR-RUN-03`, `oid progress revise FR-RUN-04`): the regression of `oid run` in two levels (ADR-030, design §6.7).
4. FR-VERIFY-10, then FR-RUN-13: evidence by mutation where a Red is impossible (ADR-056), guards in shadow mode.
5. The `tune(prompts)` tasks below, one change per measured run.
6. The rest of the MVP: spike S3, FR-TUI-02, FR-TUI-01, FR-TUI-04, FR-RUN-12.

**Process changes (ADR-057), alongside the FRs:**

- [ ] `tune(prompts)`: split the fix-at-cause trait (keep its value and why; drop the "never" clauses the sandbox and integrity enforce; move "do not shape code to one test" to `CODE_GREEN`), then review each state's prompt against the skill checklist (design §7.9). One change per measured run.
- [ ] A small set of real runs over varied requirements as the evidence base for prompt changes.
- [ ] `tune(prompts)`: the coding agent's prompt states its objective and its place in the workflow: it is one step of several, the next steps depend on it doing its part (make this test pass, no more and no less), and other agents do the rest. Measured against tests and TDD cycles per scenario.

**Switch-over.**

- [x] Tag and install `v0.7.0` once FR-RUN-07 is done (the cycle can complete). `v0.6.0` already shipped with the git block.
- [x] Run `oid run --fr <id>` on a small FR of oid itself: four runs on FR-TUI-06, used to measure and fix the prompts, none merged yet (bootstrap log).
- [ ] An `oid run` of a small, low-risk FR that is merged after review. Good candidates: FR-TUI-04 or FR-RUN-12.
- [ ] Compare with an FR of similar size done with Claude Code: retries, human interventions, cost, time, health delta. Write both in the bootstrap log.
- [ ] Golden run: the URL shortener from the article, in TypeScript, as a fixture project.

**Fallback rule.** Until the end of Phase 4, the Claude Code path stays fully usable. If oid blocks on its own development (for example, a Red classification bug prevents writing the test that fixes it), fix it through Claude Code, running the tests directly, with the previous installed build.

**Exit criteria (M1).**

- `oid run` has completed at least three FRs of oid, merged after review.
- The golden run reaches `DONE`.

**What changes afterwards.** New FRs of oid are candidates for `oid run` by default; Claude Code is used when `oid run` cannot yet do something.

---

## Phase 4. Decisions and feature refactor (M2)

**Goal.** Jev in every decision point, feature-level refactor, and the remaining interaction features. Dogfooding becomes the default.

**Work.** Spike S2, then FR-DEC-01 … FR-DEC-04, FR-REF-01 … FR-REF-03, FR-TUI-05 … FR-TUI-07.

**Switch-over.**

- [ ] Tag and install `v0.8.0`.
- [ ] `oid run` is the default for oid's own FRs; Claude Code only as fallback, with the reason written in the bootstrap log.
- [ ] Review thresholds with `oid decisions` after every few FRs; record changes in `DECISIONS.md`.
- [ ] Buddy rehearsal: on a branch of Buddy, `oid init --import-progress`, then `oid run` on one small Buddy FR. Merge only if the result is good; either way, write the findings in the bootstrap log.

**Exit criteria (M2).**

- At least five FRs of oid done with `oid run`, including some with refactor findings.
- Agreement between Jev and human answers measured for each decision point.

---

## Phase 5. Design phase and periodic cleanup (M3, closes the MVP)

**Work.** FR-SPEC-01 … FR-SPEC-03, FR-TIDY-01 … FR-TIDY-04.

**Switch-over.**

- [ ] Tag and release `v1.0.0` of oid (publish `outside-in-dev` to npm when ready).
- [ ] New FRs of oid are added with `oid spec`, not by hand.
- [ ] First `oid tidy` on oid; review the plan, compare with `oid metrics` before and after.
- [ ] **Migrate Buddy:**
  - [ ] `oid init --import-progress`; review `.outside-in.json`: `paths.source` = `backends/**`, `shared/**`, `src/**`; `paths.shared` = `shared/**`; features in `specs/features/`, steps in `tests/steps/`, unit tests in `tests/unit/`; `commands.bdd` with `NODE_OPTIONS="--import tsx"`; `vite build` in `commands.extra_checks`; `knip` entries from S4.
  - [ ] Replace `scripts/progress.ts` with `oid progress`, and `tests/unit/progress-consistency.test.ts` with `oid check` in the test script.
  - [ ] Update Buddy's `CLAUDE.md` to the new commands (or to `oid run` as the default way to implement an FR).
  - [ ] Record the baseline (`oid metrics`) and run a first `oid tidy` with a small `--max-items`.

**Exit criteria (MVP).**

- oid develops itself with `oid spec`, `oid run` and `oid tidy`.
- Buddy uses oid for new FRs.

---

## After the MVP


| Milestone                            | Start when                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **M4. Web dashboard**                | The terminal interface has been used enough to know which views matter.                            |
| **M5.** `fix-bug`                    | A real bug in oid or Buddy is fixed by hand with the test-first procedure and its steps are clear. |
| **M6.** `new-project` **and Python** | A new project is about to start, or a Python project needs oid.                                    |
| **M7. Local decision model**         | `oid decisions` has enough labelled history to calibrate `llama-cpp-classify` against Jev.         |


---

## Bootstrap log

Kept in `docs/bootstrap-log.md`, one row per FR or fix: who built it, retries, human interventions and overrides, cost, time and notes. It is what tells whether dogfooding is working and where oid is still weak, and it can record which claims of the article the work confirmed or refuted (ADR-054).
