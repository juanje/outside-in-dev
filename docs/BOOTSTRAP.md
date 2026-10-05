# Bootstrap roadmap

How oid gets built with its own methodology and starts building itself. The principle (ADR-024): develop with Claude Code guided by `AGENTS.md`, and order the work so that every deterministic piece of oid **replaces a manual part of the process as soon as it exists**. Dogfooding starts in the first phase that produces a command, not when `oid run` works.

Each phase lists its goal, the work, the exit criteria, and **what changes afterwards**: the switch-overs that make the next phase use what this one built. A phase is not finished until its switch-overs are done.

## Status

| Phase | Milestone | Status |
|:--|:--|:--|
| 0. Repository and design | — | ☐ |
| 1. Spikes | — | ☐ |
| 2. Deterministic core, dogfooded by replacement | M0 | ☐ |
| 3. Agents and the feature cycle | M1 | ☐ |
| 4. Decisions and feature refactor | M2 | ☐ |
| 5. Design phase and periodic cleanup | M3 (closes the MVP) | ☐ |
| After the MVP | M4–M7 | ☐ |

---

## Phase 0. Repository and design

**Goal.** A repository where an agent can start the cycle on the first FR.

**Work.**

- [x] Create the `outside-in-dev` repository with `README.md`, `SPEC.md`, `DOMAIN.md`, `DECISIONS.md`, `AGENTS.md`, `CLAUDE.md`, `progress.json`, `docs/METHODOLOGY.md`, `docs/BOOTSTRAP.md` and `docs/design.md`. Add the MIT `LICENSE` file by hand.
- [ ] Review `SPEC.md` as a human: this is the methodology's design phase, done by hand. Reorder, merge or drop FRs; check the MVP, the scope boundaries and the NFRs.
- [x] Scaffold the project (`chore:` commit, no behaviour):
  - `package.json`: name `outside-in-dev`, `"type": "module"`, `"license": "MIT"`, `"engines": { "node": ">=22.19.0" }` (what `@earendil-works/pi-coding-agent@1.0.3` declares), `bin: { "oid": "dist/cli.js" }`, scripts `build` (`tsc`), `typecheck` (`tsc --noEmit`), `test:unit` (`vitest run`), `test:bdd` (`NODE_OPTIONS="--import tsx" cucumber-js`), `test` (both).
  - Dependencies pinned exactly: `@earendil-works/pi-coding-agent`, `pi-ai`, `pi-agent-core`, `pi-tui` at `1.0.3`. Dev: `typescript@7.0.2`, `tsx@4.23.15`, `vitest@3.2.7`, `@cucumber/cucumber@13.3.0`. Stay on vitest 3: the failure shapes in `DOMAIN.md` were observed on vitest 3, and the npm `latest` tag is vitest 5.
  - `src/cli.ts`: an empty module (`export {}`). It is the source of `dist/cli.js`. Without at least one file under `include`, `tsc --noEmit` exits with TS18003.
  - `tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `module` and `moduleResolution` `"NodeNext"`, `target` `"ES2022"`, `outDir` `"dist"`, `rootDir` `"src"`, `include` `["src/**/*.ts"]`.
  - `vitest.config.ts`: `include` `tests/unit/**/*.test.ts` and `passWithNoTests: true`. Without that flag, vitest 3.2.7 exits 1 when no test file exists.
  - `cucumber.mjs`: paths `features/**/*.feature`, imports `features/steps/**/*.ts` and `features/support/**/*.ts`. cucumber-js 13.3.0 exits 0 when no feature matches, so the empty gate needs no placeholder feature.
  - `.gitignore` with `node_modules/`, `dist/`, `.outside-in/`.
- [x] Check that the empty gate runs: `npx tsc --noEmit`, `npm run test:unit`, `npm run test:bdd`.

**Exit criteria.**

- `SPEC.md` answers the article's six questions: goal, MVP, what it is not, cross-cutting rules, domain, stack.
- The three gate commands run and pass on an empty project.
- First commit on `main`.

**What changes afterwards.** Nothing yet: agents follow `AGENTS.md` and edit `progress.json` by hand (`docs/METHODOLOGY.md`, "Updating progress").

---

## Phase 1. Spikes

**Goal.** Answer the technical unknowns before writing code that depends on them. If a spike fails, the design changes now, not halfway through M1.

Rules: each spike lives in `spikes/<name>/`, has a written question and a time box, records its answer in `DECISIONS.md`, and is deleted when done. Spikes are not test-first; that is why they are thrown away.

S1 is only the delta. The rest was already answered in Buddy, whose lockfile is `@earendil-works/pi-coding-agent` 1.0.1 (the design notes that still say 0.84 describe where the pattern was learned, not what Buddy runs now):

- No settings read from `~/.pi/agent`. Every `createAgentSession` passes an explicit `agentDir` (`~/.buddy/agent`). NFR-SEC-19 and NFR-SEC-20, guarded by `tests/unit/agent-dir-isolation.test.ts`. Two later leaks (`modelsPath`, `SessionManager.create` without a session directory) were the same kind of unnamed SDK default, and were closed the same way.
- A `beforeToolCall` block whose reason reaches the model. `backends/permissions.ts` returns `{ block: true, reason }`. The heading guard (FR-GUARD-01c) showed the sibling fact: the model only sees a hook result when it is written into the tool result (`afterToolCall` rewriting `ctx.result`), not when it is logged on the event stream.
- One array for `tools` and `customTools`. `backends/session-boot.ts`, held by `tests/unit/agent-toolset.test.ts`. A tool missing from the allowlist is never offered, with no error.
- `session.abort()` is called from `backends/worker-core.ts`, with BDD coverage.

`pi-permission-gate` (Pi 0.79.10) returns the same `{ block: true, reason }` from the extension `tool_call` event. That is the path oid uses in the design phase, where `InteractiveMode` can replace the session and drop a hook installed by hand. It does not isolate `~/.pi/agent`: an extension runs inside the user's Pi.

| Spike | Question | Done when | Time box |
|:--|:--|:--|:--|
| **S1. Pi 1.0.3 delta** | Do `prompt()` and `classify()` report a bad API key as `stopReason: "error"`, and do `SessionManager.create(cwd, dir)` and `session.abort()` still match Buddy's 1.0.1 usage? | A short script on 1.0.3 shows the bad-key `stopReason` for both calls, a transcript written by `SessionManager.create(cwd, dir)`, and `session.abort()` stopping a turn. | ½ day |
| **S2. Jev on real traces** | Does Jev classify Red failures and refactor findings well enough to be useful, and at what latency and cost? | 20–30 hand-labelled cases (the vitest and cucumber failures in `DOMAIN.md` plus real ones from Buddy's history, and a dozen detector findings) run through `classify()` via OpenRouter `typesafe/jev-1.13`. Agreement with the labels, latency, cost per call, and the scale of `score` answers recorded. | 1 day |
| **S3. Terminal interface** | Can `pi-tui` give the progress view and the switch to conversation described in §12.2? | A script with fake events: a progress view updating in place, a decision card with a `SelectList`, a switch to a chat using Pi's exported message components, and back. Main screen vs alternate screen tried with scrollback. | 1 day |
| **S4. Detectors and timing** | Do `knip`, `jscpd` and `tsc` work on real projects with acceptable noise and time? | Run on oid's scaffold and on a copy of Buddy: entry configuration needed for `knip` (worker, Svelte frontend, scripts), false-positive rate on a sample, run times, and `tsc --noEmit` time on Buddy (for the `CODE_GREEN` type check). | ½ day |

**Exit criteria.**

- Every spike has an answer in `DECISIONS.md` (new ADR or an update to an existing one).
- Any design change is reflected in `docs/design.md`, and in `SPEC.md` if it changes behaviour.
- `spikes/` is empty.

**What changes afterwards.** The pending verifications in `docs/design.md` §20 are closed. If S2 shows Jev is not useful enough for a decision point, that point's deterministic default becomes the behaviour and the FR is adjusted.

---

## Phase 2. Deterministic core, dogfooded by replacement (M0)

**Goal.** Every command that does not need an LLM, each one put to work on oid's own development as soon as it is done.

Built with Claude Code following `docs/METHODOLOGY.md`. The order matters: each block replaces a manual part of the process used by the next one.

**Releasing a tool build.** Several switch-overs install oid to use it on itself. Always from a packed tarball, never with `npm link` or from the working tree (the code being changed must not be the code that runs):

```
git checkout <tag> && npm ci && npm run build && npm pack
npm install -g ./outside-in-dev-<version>.tgz
```

Keep the previous tarball: if a release misbehaves, reinstall it.

### 2.1 Progress — FR-PROG-01 … FR-PROG-07

**Why first.** Every session reads and writes progress. Today that is manual editing of JSON.

**Switch-over.**

- [ ] Tag and install `v0.1.0`.
- [ ] `docs/METHODOLOGY.md`: remove the "before FR-PROG exists" instructions; progress is updated only through `oid progress`.

### 2.2 Consistency checks — FR-CHECK-01 … FR-CHECK-04

**Why now.** Specification, feature files and progress drift apart without anyone disobeying anything.

**Switch-over.**

- [ ] Tag and install `v0.2.0`.
- [ ] Add `oid check` to the quality gate in `AGENTS.md`.
- [ ] Add a git pre-commit hook that runs `oid check` (`scripts/pre-commit`, installed into `.git/hooks/`).

### 2.3 Project setup — FR-INIT-01 … FR-INIT-03

**Switch-over.**

- [ ] Tag and install `v0.3.0`.
- [ ] Run `oid init` on oid itself and review the generated `.outside-in.json`; commit it.
- [ ] Rehearse `oid init --import-progress` on a **throwaway copy** of Buddy. Note what fails or is lost in the bootstrap log (below); do not commit anything in Buddy.

### 2.4 Code health — FR-MET-01 … FR-MET-07

**Why now.** It turns the periodic "please clean up" requests into data before any agent automation exists.

**Switch-over.**

- [ ] Tag and install `v0.4.0`.
- [ ] Record the baseline on oid: `oid metrics`.
- [ ] `docs/METHODOLOGY.md`, steps 5 and 6: use `oid metrics --changed` instead of the manual checklist.
- [ ] Add `oid metrics --changed` to the quality gate in `AGENTS.md` (blocking only on new findings).
- [ ] Run `oid metrics` read-only on Buddy and keep the report: it is the "before" picture for its migration.

### 2.5 Verification — FR-VERIFY-01 … FR-VERIFY-05

**Why now.** This is "enforcement by architecture" before the state machine exists: the agent's claims about Red and Green are replaced by a command.

**Switch-over.**

- [ ] Tag and install `v0.5.0`.
- [ ] `docs/METHODOLOGY.md`, steps 2–4: `oid verify red` / `oid verify green` decide; the agent may not advance `cycle_step` without them.
- [ ] Configure Claude Code hooks in `.claude/settings.json` so the rules are mechanical, not just written: after edits, run `oid verify integrity` for the current `cycle_step` (no source changes while writing tests, no test changes while writing code, no forbidden patterns); before `oid progress step`, require the matching `oid verify` to have passed.

### 2.6 Git isolation — FR-GIT-01 … FR-GIT-03

**Why last in M0.** Nothing manual depends on it; Phase 3 does.

**Switch-over.** None for daily work. Tested on fixture repositories.

**Exit criteria (M0).**

- Every M0 FR is done, through oid's own gate (including `oid check`, `oid metrics --changed` and `oid verify`).
- Daily work on oid already uses `oid progress`, `oid check`, `oid metrics` and `oid verify`.
- The bootstrap log has entries for every M0 FR.

**What changes afterwards.** The manual parts of the cycle are gone; only writing the tests and the code is still done by Claude Code.

---

## Phase 3. Agents and the feature cycle (M1)

**Goal.** `oid run` completes a feature end to end on a real project.

**Recommended order** (the human sets the focus; `progress.json` keeps the specification order):

1. FR-AGENT-01 … FR-AGENT-08: sessions, sandbox (with the wiring test: the hook is installed, not just correct), secrets, report, provider failures, edit hints, dependencies, context and reuse catalogue.
2. FR-TUI-03 (plain output): lets the cycle run before the interface exists.
3. FR-RUN-01 … FR-RUN-04: start, feature files and review (in plain mode), BDD Red, inner loop.
4. FR-RUN-05: micro refactor.
5. FR-RUN-06, FR-RUN-07: quality gate and commit.
6. FR-TUI-02, FR-TUI-01: cards and feature review, then the progress view.
7. FR-RUN-08 … FR-RUN-10: retries, resume and abort, budget.
8. FR-TUI-04: final report.

**Switch-over.**

- [ ] Tag and install `v0.6.0` once FR-RUN-07 is done (the cycle can complete).
- [ ] Run `oid run --fr <id>` on a **small, low-risk** FR of oid itself. Good candidates: FR-TUI-04 or FR-DEC-03, mostly deterministic and easy to review.
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

**Work.** FR-DEC-01 … FR-DEC-04, FR-REF-01 … FR-REF-03, FR-TUI-05 … FR-TUI-07.

**Switch-over.**

- [ ] Tag and install `v0.7.0`.
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

| Milestone | Start when |
|:--|:--|
| **M4. Web dashboard** | The terminal interface has been used enough to know which views matter. |
| **M5. `fix-bug`** | A real bug in oid or Buddy is fixed by hand with the test-first procedure and its steps are clear. |
| **M6. `new-project` and Python** | A new project is about to start, or a Python project needs oid. |
| **M7. Local decision model** | `oid decisions` has enough labelled history to calibrate `llama-cpp-classify` against Jev. |

---

## Bootstrap log

Kept in `docs/bootstrap-log.md`, one row per FR. It is what tells whether dogfooding is working and where oid is still weak.

| FR | Built with | Retries | Human interventions | Cost | Time | Health delta | Notes |
|:--|:--|:--|:--|:--|:--|:--|:--|
| FR-PROG-01 | Claude Code | — | — | — | — | — | |
