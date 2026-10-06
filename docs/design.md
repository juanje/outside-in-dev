# Technical design: Outside-In Development CLI (`oid`) — v3.11

> Status: design draft. MVP = `new-feature` workflow + periodic cleanup (`oid tidy`) + TypeScript stack.
> Methodology reference: [Outside-In Development: Spec → BDD → TDD for AI Coding Agents](https://ai.juanjeojeda.com/outside-in-development)
> The article is the **only reference for the methodology's artifacts** (`SPEC.md`, `.feature`, `progress.json`). The Buddy project, which predates the final version of the methodology, is used as an **engineering** reference: how to use the Pi SDK and which testing and robustness lessons it left in production. Decisions marked *(Buddy)* come from its code.

`oid` (from *Outside-In Development*) is a command-line tool that enforces the Outside-In methodology (Spec → BDD → TDD) on coding agents. It is not an assistant that "tries to follow" the methodology: it is a harness in which the methodology **is** the control flow. A finite state machine (FSM) written in TypeScript decides what happens at each moment; ephemeral subagents created with the Pi SDK generate specifications, tests and code; and a decision model (Jev, from TypeSafe AI, through Pi's classifier API) answers the semantic micro-decisions that deterministic code cannot make.

**Name.** The command is `oid` and the npm package `outside-in-dev` (`npm install -g outside-in-dev`). The name follows the methodology's and distinguishes it from *Outside-In TDD*, the Freeman and Pryce school with which it shares a name but not a procedure. npm has packages called `oi` and `oid`, but neither installs an executable; `outside-in-dev` is free. The target project's files keep their descriptive names: `.outside-in.json` and `.outside-in/`.

---

## 1. Motivation

Coding agents fail in four predictable ways: they build the wrong thing, they do not verify their work, they over-engineer, and they do not know when to stop. The Outside-In methodology attacks the common cause (the lack of a verifiable contract), but when it is applied only through instructions in an `AGENTS.md`, it depends on the model's discipline. And discipline degrades:

1. **Test cheating.** An agent with simultaneous access to tests and implementation tends to fit the tests to the code or to relax assertions to make them pass.
2. **Context inflation and methodological drift.** In long conversations the model forgets instructions, mixes phases and drags along thousands of irrelevant tokens (full traces, obsolete code, earlier debates).
3. **The false deterministic/generative dichotomy.** An `if` cannot tell whether an error trace is a business failure or a broken import; a general reasoning LLM is slow and expensive for a yes-or-no question.

Buddy's experience sums it up in one rule: **a rule only governs what it can reach**. Several of Buddy's defects were already forbidden in the prompt or in `AGENTS.md`; the instruction did not fail, it simply did not apply, because the failure happened without anyone disobeying (a documentation status nobody updated, a missing call, a consolidation that "succeeded" in 22 ms without doing anything). When a failure requires no disobedience, the protection has to live in code. `oid` takes that idea to the whole cycle.

## 2. Goals and non-goals

### Goals

- **Enforce the methodology by construction**, not by instruction. The model cannot skip the Red because it is not the one deciding the transition.
- **Context isolation.** Each subagent receives only what it needs for its immediate task and dies when it finishes.
- **Token efficiency.** Everything deterministic is done by Node.js, git, parsers and the stack's tools; micro-decisions go to Jev (~200 ms, no output tokens); generative models are reserved for writing specs, tests and code.
- **Autonomy after human review.** Once the design artifacts are defined and the features reviewed, the cycle must complete without intervention unless the system asks for it.
- **Contain code drift.** Following the cycle to the letter does not prevent duplication, complexity, dead code, hard-coded values and stale documentation from appearing, feature after feature. Refactoring stops being an optional "if needed" step and is guided by deterministic detectors at three scales (§6.8, §14.1).
- **Be used on real projects as soon as possible.** The MVP supports TypeScript so that it can be used on `oid` itself (dogfooding) and on Buddy as soon as it is half functional, and get feedback from real use.
- **Observability and interaction in the terminal.** A modern terminal interface (§12.2): a compact progress view while the cycle runs on its own, which switches to conversation mode when a person is needed. The web dashboard comes after the MVP, as another view over the same events.

### Non-goals (MVP)

- The `new-project` and `fix-bug` workflows (designed in §14, implemented later).
- The Python stack (designed in §9.4; the `StackAdapter` interface allows for it).
- Calibrating a local decision model. Pi already allows using one with the same API (§8.1); the MVP uses Jev.
- Web dashboard (§12.5). The MVP writes all events to `events.jsonl` and handles all interaction in the terminal, so the web can be added later without touching the orchestrator.
- Remote, multi-user or CI execution.
- Merging into the main branch automatically. `oid` delivers a branch ready to review and merge (§6.11).
- Replacing human judgement in Phase 0, which is **always** interactive.

---

## 3. Design principles

1. **Inversion of control.** The FSM leads; models execute atomic tasks and hand control back.
2. **Deterministic first, Jev second, LLM last.** If a parser, an exit code, a `git diff`, the compiler or a stack tool (the formatter, a dead-code detector) can resolve it, no model is consulted.
3. **Ephemeral, caged subagents.** Each task creates a new Pi SDK session (clean context; the transcript is kept only for auditing), with limited tools and read/write access restricted by globs that depend on the **state**, not only on the role. Buddy already separates each consolidation depth into its own session to avoid context fatigue *(Buddy)*.
4. **Subagents do not run commands.** No subagent has `bash`. Tests, linters, git and dependency management are run by the orchestrator. This closes the main escape route from the sandbox and makes every verification empirical, never self-reported.
5. **Empirical confirmation of the Red.** A test only counts as Red if the runner executes it and it fails because the behaviour does not exist yet or is not correct. "Undefined", "pending" or a broken test are not Red.
6. **Git as the rollback mechanism.** After a failed attempt, the orchestrator returns to the last checkpoint. Reverting costs no tokens.
7. **Execution isolated from the user's working directory.** By default `oid` works in its own `git worktree`. The user can keep working in their copy without a rollback ever deleting anything.
8. **The methodology's artifacts live in the repo; execution state does not.** `SPEC.md`, `.feature` files and `progress.json` are versioned. `.outside-in/` is ignored by git.
9. **A single human feedback channel.** In the MVP, the terminal; after the MVP, also the web. If there are several channels, whoever answers first wins.
10. **The artifacts are the article's, and they also work without `oid`.** `SPEC.md`, the `.feature` files and `progress.json` follow the article's format, and `oid progress` (§15) exposes the same rules to any human or agent. A project can advance some features with `oid` and others with an agent guided by an `AGENTS.md`, without migrations.
11. **"It went well" is not evidence.** A session ending, `prompt()` resolving or an agent reporting success proves nothing; the proof is the artifact: the test that ran, the diff, the exit code *(Buddy)*.

---

## 4. Target project artifacts

### 4.1. Inventory

| Artifact | Location (default) | Content | Written by |
|:--|:--|:--|:--|
| `SPEC.md` | root | FRs and NFRs with unique IDs. No acceptance criteria. | spec-agent + human (Phase 0) |
| `DOMAIN.md` | root | Glossary, real examples, formats, edge cases. Optional. | spec-agent + human (Phase 0) |
| `DECISIONS.md` | root | ADRs: context, options, decision, consequences. | spec-agent + human (Phase 0) |
| `.feature` | `features/` | Gherkin scenarios with traceability tags. | bdd-agent (`FEATURE_WRITE`) + human review |
| Step definitions | `features/steps/`, `features/support/` | TypeScript steps with real assertions (cucumber-js). | bdd-agent (`BDD_RED`) |
| Unit tests | `tests/unit/**/*.test.ts` | vitest tests. | tdd-agent |
| Code | `src/` | Minimal implementation. | coder-agent |
| Documentation | `README.md`, `docs/` | Project documentation (not the design artifacts). | refactor (§6.8, §14.1) |
| Dependencies | `package.json`, lockfile | Project packages. | **only the orchestrator** (via `request_dependency`, §7.7) |
| `progress.json` | `paths.progress` | Methodology state per FR and scenario (§4.4). | **only the orchestrator** (or `oid progress`, §15) |

Paths are configurable (`paths`, §16); `oid init` detects the project's structure and proposes it. What is not configurable is the **format** of the artifacts: it is the article's.

### 4.2. `SPEC.md` format

The article's. Each requirement is a heading with a unique ID, a short title and a description of **what** it does and **why** it matters. No acceptance criteria: those live only in the `.feature` files.

```markdown
## Functional Requirements

### FR-SHORTEN-01: Shorten a URL

Given a valid URL, the system generates a unique short code
and returns the shortened URL. ...

## Non-Functional Requirements

### NFR-01: Idempotency

Shortening the same URL twice must return the same short code. ...
```

Parser rules:

- FR: `^### (FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?): (.+)$` (an optional lowercase suffix, as in `FR-PERM-06b`, see ADR-026)
- NFR: `^### (NFR-\d{2,3}): (.+)$`
- The body of each requirement is the text up to the next heading of level ≤ 3.
- Level-2 section titles are not interpreted: the parser is guided only by the IDs, so it works the same with a `SPEC.md` in other languages.

`SPEC_CHECK` validations on the target FRs (blocking):

- The ID exists and is unique in `SPEC.md`.
- Title and body are not empty.
- **No acceptance criteria in the body**: a Gherkin-style sequence (a line starting with `Given`, plain, as a bullet or in bold, followed later by one starting with `Then`) or a `Scenario:` line. An ordinary sentence that starts with "When" does not count; with the naive rule (any line starting with those words), `oid`'s own `SPEC.md` produced six false positives. This is the article's most explicit rule: the spec defines intent; Gherkin, verifiable behaviour. If it appears, `WAITING_INPUT` with the options to edit the FR or abort.

### 4.3. Traceability

The article's four pieces, linked by FR-ID: `SPEC.md` (IDs as headings), `.feature` (`@FR-xxx` tags), tests and `progress.json`. The orchestrator checks it with the Gherkin parser (`@cucumber/gherkin`) and the `SPEC.md` parser:

- Every scenario has at least one `@FR-…` tag that exists in `SPEC.md`. **Effective tags** are evaluated (the scenario's plus those inherited from the `Feature`), which is Gherkin's semantics. The `.feature` files written by `oid` have one file per FR and the tag on the `Feature`.
- `@NFR-…` tags are optional, but if they appear they must exist.
- Every FR with `status: done` in `progress.json` has all its scenarios in `pass`.
- Every scenario of an FR in `progress.json` exists in a `.feature`, and every FR past `select` appears in some `.feature`.
- Behaviour without a scenario, or a scenario without an FR, is a violation: the article treats them as "should not be there" or "incomplete spec".

**Frozen debt.** An existing repository may have earlier violations. `BASELINE` records them and they do not block; only new ones count (§6.14).

These rules are part of `QUALITY_GATE`.

### 4.4. `progress.json`

A methodology artifact, versioned. It answers "what is built and what is left?" for any human or agent, with or without `oid`. It is **schema-validated JSON, not Markdown**, precisely so that an agent cannot keep adding prose to it until it stops being a reliable record. It is written only by the orchestrator (or `oid progress`, §15).

Schema, the article's:

```json
{
  "current_focus": "FR-SHORTEN-01",
  "features": [
    {
      "id": "FR-SHORTEN-01",
      "title": "Shorten a URL",
      "status": "in_progress",
      "cycle_step": "tdd_green",
      "scenarios": [
        { "name": "Shorten a valid URL", "bdd": "fail" },
        { "name": "Same URL returns same code", "bdd": "pending" }
      ]
    },
    { "id": "FR-SHORTEN-02", "title": "Redirect to original URL", "status": "pending" }
  ]
}
```

| Field | Values |
|:--|:--|
| `status` | `pending`, `in_progress`, `done` |
| `cycle_step` | `select`, `bdd_red`, `tdd_red`, `tdd_green`, `refactor`, `quality_gate` (the steps of the article's cycle) |
| `scenarios[].bdd` | `pending`, `fail`, `pass` |

`scenarios` and `cycle_step` only appear on FRs that have started. The schema does not allow additional fields: whatever else `oid` needs (test ids, unit tests per scenario, reasons for a skip) lives in `session.json` and `events.jsonl`.

**Valid `cycle_step` transitions.** They follow the article's two loops, not a straight line:

```
select → bdd_red → tdd_red → tdd_green → refactor ─┬─→ tdd_red        (inner loop: scenario still red)
                                                   ├─→ bdd_red        (outer loop: next scenario)
                                                   └─→ quality_gate   (all scenarios green)
```

From `tdd_green` it is also possible to go directly to `tdd_red`, `bdd_red` or `quality_gate` when there is no refactor. Any other transition is rejected.

**Moving to `done`.** Only if all scenarios are in `pass`, the FR is at `quality_gate` and the quality gate has passed. `oid` also adds its own rule, checked from `session.json`: each scenario has gone through at least one TDD cycle (§6.6). On moving to `done`, `cycle_step` disappears and `current_focus` moves to the next FR or to `null`.

**Mapping to the FSM.** Almost one to one:

| FSM states | `cycle_step` |
|:--|:--|
| `SPEC_CHECK`, `SELECT_FR` | `select` |
| `FEATURE_WRITE`, `FEATURE_REVIEW`, `BDD_RED` | `bdd_red` |
| `TDD_RED` | `tdd_red` |
| `CODE_GREEN` | `tdd_green` |
| `REFACTOR`, `BDD_CHECK`, `FR_REFACTOR` | `refactor` |
| `QUALITY_GATE`, `QUALITY_FIX` | `quality_gate` |
| `FR_COMMIT` | `status: done` |

**Order.** The order of `features` is the default execution order. `oid spec` appends new FRs at the end; the human can reorder.

### 4.5. The `.outside-in/` directory (ignored by git, in the main copy)

```
.outside-in/
├── lock                         # PID of the active process
├── session.json                 # state for resuming
└── runs/<runId>/
    ├── events.jsonl             # every event of the run
    ├── baseline.json            # frozen debt at start (§6.14)
    ├── report.md                # final report
    ├── sessions/                # transcript of each agent session (auditing)
    ├── findings/<n>.json        # refactor detector findings (§6.8)
    ├── tests/<n>-bdd.ndjson     # Cucumber Messages of each run
    └── tests/<n>-unit.json      # vitest JSON report

.outside-in/metrics.jsonl        # code-health metrics history, across runs (§6.8)
```

---

## 5. Architecture

```
                       ┌─────────────────────────────┐
                       │ CLI: oid spec / run / resume│
                       └──────────────┬──────────────┘
                                      │
                       ┌──────────────▼─────────────┐
                       │     Orchestrator (FSM)     │
                       │  states · gates · retries  │
                       └──┬──────┬──────┬──────┬────┘
                          │      │      │      │
          ┌───────────────▼┐ ┌───▼────┐ ┌▼─────────┐ ┌▼──────────────┐
          │ DecisionAdapter│ │ Agent  │ │  Stack   │ │ Artifacts     │
          │ (Jev)          │ │ Runner │ │  Adapter │ │ (SPEC,        │
          │ choice/score/  │ │ (Pi    │ │ (vitest, │ │  Gherkin,     │
          │ bool           │ │  SDK)  │ │ cucumber)│ │  progress)    │
          └────────────────┘ └────────┘ └──────────┘ └───────────────┘
                          │      │      │      │
                       ┌──▼──────▼──────▼──────▼────┐
                       │ Git controller (worktree,  │
                       │ checkpoints) · Session     │
                       └──────────────┬─────────────┘
                                      │
                       ┌──────────────▼─────────────┐
                       │          EventBus          │
                       ├────────┬─────────┬─────────┤
                       │events. │  TUI    │ notify  │
                       │jsonl   │(pi-tui) │ hook    │
                       └────────┴─────────┴─────────┘
                       (post-MVP: web dashboard, SSE + REST)
```

| Component | Nature | Responsibility |
|:--|:--|:--|
| Orchestrator (FSM) | Deterministic | States, transitions, gates, retries, escalation, budget. |
| Artifacts | Deterministic | Parse `SPEC.md` and Gherkin, traceability, `progress.json`. |
| StackAdapter | Deterministic | Runners, format/lint autofix, type check, dependencies, signatures and reuse catalogue (AST), refactor detectors and metrics. |
| Git controller | Deterministic | Worktree, branches, checkpoints, rollback, squash, integrity. |
| DecisionAdapter | Probabilistic, ~200 ms | Classify failures, test quality, effort, spec, informational DoD. |
| AgentRunner | Generative | Ephemeral Pi sessions, context contract, final report. |
| EventBus | Deterministic | Event log, terminal interface, notifications, feedback channel (and, after the MVP, web dashboard). |

---

## 6. Orchestrator (FSM)

### 6.1. States

```
IDLE ─▶ PREFLIGHT ─▶ BASELINE ─▶ SPEC_CHECK ─▶ SELECT_FR
                                                   │
                     ┌─────────────────────────────┘
                     ▼
              FEATURE_WRITE ─▶ FEATURE_REVIEW ─▶ (next scenario)
                                                        │
     ┌──────────────────────────────────────────────────┘
     ▼
  BDD_RED ─▶ TDD_RED ─▶ CODE_GREEN ─▶ REFACTOR ─▶ BDD_CHECK ──(scenario still red)──▶ TDD_RED
                                                     │
                                                     ├─(scenario green, more left)─▶ BDD_RED
                                                     │
                                                     └─(last scenario green)─▶ FR_REFACTOR ─▶ QUALITY_GATE
                                                                                                  │
                                                                  ┌─(fixable failure)─ QUALITY_FIX ◀┤
                                                                  └──────────▶ QUALITY_GATE        │
                                                                                                  ▼
                                                                                  FR_COMMIT ─▶ SELECT_FR ─▶ … ─▶ DONE

Any state ──▶ WAITING_INPUT ──▶ (action chosen by the human)
Any state ──▶ ABORTED
```

With `review_features: "upfront"` (the default), `FEATURE_WRITE` and `FEATURE_REVIEW` run for **all** target FRs before the first `BDD_RED`: the human reviews once at the start and the rest of the run is unattended. With `"per_fr"` they run at the start of each FR. With `"off"` they are approved automatically.

### 6.2. State table

| State | What happens | Exit gate |
|:--|:--|:--|
| `PREFLIGHT` | Acquires the lock. Checks tools, credentials and config. Creates the run's worktree and branch (§6.11) and prepares its dependencies (§9.2). | All OK. |
| `BASELINE` | Runs the full existing suite (unit + BDD), the quality gate, the traceability checks and the refactor detectors. Records the baseline (§6.14) and a metrics snapshot (§6.8). | Tests green. If there are red tests, `WAITING_INPUT` (§10.1): an inherited Red cannot be told apart from a new one. Earlier lint and type errors, refactor findings and traceability violations are accepted as frozen debt. |
| `SPEC_CHECK` | Parses `SPEC.md` (§4.2). Checks that the target FRs exist. Jev evaluates ambiguity and testability. | Deterministic + Jev (§8.2). |
| `SELECT_FR` | Next `pending` FR in `progress.json`, or the one given with `--fr`. | Deterministic. |
| `FEATURE_WRITE` | bdd-agent writes the FR's `.feature` files (Gherkin only). | They parse; ≥1 scenario; traceability (§4.3); Jev: FR coverage. |
| `FEATURE_REVIEW` | The human approves, edits and approves, or rejects with a comment (back to `FEATURE_WRITE`). | Approval. The hash of each `.feature` is stored. |
| `BDD_RED` | bdd-agent writes the steps of the current scenario. The current scenario and the already-green ones run. | Steps loadable (§9.2); valid Red of the current one (§6.4); the others still green; `.feature` files untouched. |
| `TDD_RED` | tdd-agent writes **one** unit test. The unit suite runs. | Valid Red of the new test; the rest still green; test quality (§8.2). |
| `CODE_GREEN` | coder-agent implements the minimum, with the reuse catalogue in its context (§7.8). Format autofix. Full unit suite and type check. | Unit green + no new type error in source code (§9.2) + integrity (§6.5). |
| `REFACTOR` | Micro refactor (§6.8): detectors on the code that just changed; if there are findings, the coder-agent fixes them. Without findings, no agent is started. | Acceptance criteria of §6.8; if not met, rollback and the findings move to `FR_REFACTOR`. |
| `BDD_CHECK` | Runs the current scenario and the already-green ones (regression). | Current green → next scenario or `FR_REFACTOR`; current red → `TDD_RED`; regression in another → `CODE_GREEN` failure. |
| `FR_REFACTOR` | Meso refactor (§6.8): detectors on the FR's whole diff, including tests, steps and documentation. One item per group of findings. | Criteria of §6.8, plus the guarantee for refactored tests. Failed items are discarded and left pending for `oid tidy`. |
| `QUALITY_GATE` | Format, lint, types, unit, BDD, coverage, NFR checks, traceability. Metrics snapshot of the FR. | All PASS. |
| `QUALITY_FIX` | Targeted fix of lint/type errors (§6.9). | Back to `QUALITY_GATE`. |
| `FR_COMMIT` | Squash of the FR's checkpoints into one commit; `progress.json` updated. | Deterministic. |
| `WAITING_INPUT` | Human decision (§10). | Valid answer. |
| `DONE` | Final report (§12.4), releases the lock. | — |

### 6.3. Implementation

A typed transition table, without frameworks:

```typescript
type State =
  | "IDLE" | "PREFLIGHT" | "BASELINE" | "SPEC_CHECK" | "SELECT_FR"
  | "FEATURE_WRITE" | "FEATURE_REVIEW" | "BDD_RED" | "TDD_RED" | "CODE_GREEN"
  | "REFACTOR" | "BDD_CHECK" | "FR_REFACTOR" | "QUALITY_GATE" | "QUALITY_FIX" | "FR_COMMIT"
  | "WAITING_INPUT" | "DONE" | "ABORTED";

interface StepOutcome {
  next: State;
  reason: string;                 // human-readable; goes to the log and the interface
  checkpoint?: string;            // if the state passed its gate: checkpoint message
  input?: InputRequest;           // if next === "WAITING_INPUT"
}

type StateHandler = (ctx: RunContext) => Promise<StepOutcome>;
const handlers: Record<State, StateHandler> = { /* one per state */ };
```

After each transition, the FSM: (1) creates the checkpoint if applicable, (2) persists `session.json` atomically (temporary file + `rename`), (3) emits `state_change`, (4) checks the budget (§11).

**Key invariant:** every state can be re-executed from its last checkpoint. This is what makes retries and `oid resume` safe.

### 6.4. Red Gate

Resolved in layers, from the cheapest to the most expensive. The possible answers are those of Jev's catalogue, so that the deterministic layer and Jev speak the same language:

| Class | Valid Red? | Next step |
|:--|:--|:--|
| `business_assertion` | Yes | Move on. |
| `missing_implementation` | Yes | Move on. |
| `test_bug` | No | Rollback and retry of the same agent with the reason. |
| `environment` | No | `WAITING_INPUT`, unless a dependency is missing (`request_dependency` is suggested). |

**Layer 1 — exit code.** Exit 0 → the test passes without new implementation: `test_bug` ("does not verify new behaviour").

**Layer 2 — deterministic classification.** The StackAdapter normalises the runners' reports (vitest JSON and Cucumber Messages; never terminal text) and applies these rules. The TypeScript signals were checked with vitest 3 and cucumber-js 13; the Python ones are in §9.4.

| Signal (TypeScript) | Where it appears | Class |
|:--|:--|:--|
| `Transform failed` (syntax error) in a test file | vitest file with status `failed` and no tests | `test_bug` |
| `UNDEFINED`, `PENDING` or `AMBIGUOUS` step | `testStepFinished` in Cucumber Messages | `test_bug` |
| `Cannot find module '<path>'` and the path resolves inside `paths.source` | File message (vitest) or step exception (cucumber, with a dynamic import) | `missing_implementation` |
| `TypeError: (0 , <name>) is not a function` (or `<name> is not a constructor`) and `<name>` is imported from a project module | Test failure | `missing_implementation` |
| `Cannot find module` of a package outside the project | File or step message | `environment` |
| Tests that were green before the change fail | Comparison with the previous run | `test_bug` (the agent broke something) |
| `AssertionError` (from `expect` or `node:assert`) | Test or step failure | `business_assertion` candidate |
| Any other runtime error | Test or step failure | ambiguous → Jev |

Note: the `missing_implementation` rows are essential. In TDD the most common Red is precisely that the function does not exist yet. In vitest, a missing export does not break the file load: it arrives as `undefined` and fails when called with `is not a function`. Treating that error as "broken test" would block the cycle, and always treating it as Red would let through tests that call something that does exist incorrectly. That is why the name is resolved against the project's real exports (TypeScript compiler API): if it does not exist, it is `missing_implementation`; if it exists, the error is ambiguous and Jev decides.

**Layer 3 — Jev**, for the ambiguous cases and to confirm `business_assertion` together with test quality in the same call (§8.2).

**Layer 4 — threshold.** Confidence ≥ `thresholds.red_gate` (0.80) → accepted. Below → `test_bug` (conservative). If the same ambiguity repeats twice → `WAITING_INPUT`.

For BDD, a scenario that fails because what it tests does not exist yet is a valid Red as long as the steps are defined and run.

### 6.5. Integrity (anti test cheating)

After each agent session, the orchestrator compares the worktree with the last checkpoint (`git diff --name-status <checkpoint>` + untracked files) and checks:

- Every changed file is within the write globs of the current **state** (§7.2).
- Approved `.feature` files keep their hash.
- In the coder-agent's `CODE_GREEN`, `REFACTOR`, `FR_REFACTOR` and `QUALITY_FIX`: no change to tests, steps or `.feature` files, and no `integrity.forbidden_in_src` pattern in added lines. By default, in TypeScript: `@ts-ignore`, `@ts-expect-error` and code that behaves differently under test (`process.env.VITEST`, `import.meta.vitest`, `NODE_ENV === "test"`).
- In test states: no change to source code, and no `integrity.forbidden_in_tests` pattern in added lines. By default: `.only(` (silences the rest of the suite), `.skip(`, `.todo(` and tests that read source code as text (`readFileSync` on `paths.source`). Buddy learned that such tests break with refactors that do not change behaviour and pass when the call exists but is unreachable *(Buddy)*.
- The files declared in the `report` match the changed ones (a mismatch is logged as a warning).

Any violation → rollback of the attempt and retry with the explicit reason. The sandbox (§7.3) is the first line; this check is the second, and it does not depend on the sandbox working.

### 6.6. Inner loop

The tdd-agent receives the scenario, its normalised failure, the names and signatures of the existing unit tests and the relevant public signatures of `src/`. It writes **a single test** for the next piece of logic.

If it reports (`report.status: "done"` with `files: []` and reason `no_unit_logic_left`) that there is no unit logic left to cover but the scenario is still red, the problem is in the integration (wiring, configuration, routes). The FSM moves to `CODE_GREEN` with the BDD failure as the target and logs it as an `integration_step`.

Restriction: an `integration_step` is only accepted if the scenario already has at least one unit test. The article defines the inner loop as TDD cycles that drive the scenario to green, so `oid` requires at least one cycle per scenario; if the scenario has none, the `report` is rejected and the tdd-agent must write one. Each scenario's tests are recorded in `session.json` and checked before marking the FR `done` (§4.4). The combination of a BDD scenario that must turn green with at least one unit test covers both the piece and its wiring, which is Buddy's lesson "test the composition, not just the component" *(Buddy)*.

Limit: `max_inner_iterations` per scenario (8). When reached → `WAITING_INPUT`.

### 6.7. Regression

Every BDD run includes the current scenario **and every scenario already in `pass`** (of this FR and earlier ones). The unit suite always runs in full. A scenario or test that was green and turns red invalidates the attempt.

### 6.8. Refactor

The article includes refactoring in the cycle ("Simplify if needed. Tests stay green"), but in practice it is not applied, neither by instruction-guided agents nor by a harness that merely allows it. There are three causes, and the third is introduced by `oid` itself:

- **No signal demands it.** Red pushes to write code and Green says "done". "If needed" has no criterion, so the agent almost never sees the need, and when it does it does not know when to stop.
- **The scope is too local.** Duplication almost never appears within a scenario: it appears between features. A refactor that only looks at the last change does not see it.
- **Context isolation causes it.** The coder-agent only sees the files its test imports (§7.8). If a function that does what it needs already exists in another module, it does not know it and writes another.

`oid` solves all three by turning "refactor if needed" into **a closed list of concrete findings**, detected with tools, at three scales. That gives a signal (there are findings), a scope (these files, these lines) and a stopping condition (the findings are resolved, none new, metrics not worse). And it complements it with prevention: the reuse catalogue (§7.8).

#### Detectors

Deterministic, from the StackAdapter (§9.2 for TypeScript). `oid` bundles them: they do not depend on the project having a linter or its own configuration.

| Category | What it detects | TypeScript (MVP) |
|:--|:--|:--|
| `complexity` | Functions whose cyclomatic complexity or nesting is above the threshold | Own analysis with the TypeScript compiler API |
| `duplication` | Duplicated blocks, also across files | `jscpd` |
| `dead_code` | Unused exports, files and dependencies; commented-out code | `knip`; `tsc` with `noUnusedLocals`/`noUnusedParameters` |
| `magic_value` | Numeric literals and repeated strings that should be named constants | Own analysis on the AST (excludes 0, 1, -1 and tests) |
| `doc_drift` | JSDoc whose `@param` does not match the signature; names of functions, types or modules cited in documentation that no longer exist | Own analysis: AST against the backtick-quoted identifiers in `README.md` and `docs/` |

Each finding is a normalised record: `{ id, category, file, range, symbol?, detail, related?: [{file, range}] }`. `related` links the two parts of a duplication.

Thresholds live in `refactor.detectors` (§16). Findings that existed at the start are part of the baseline (§6.14): micro and meso refactors only deal with what the run introduces; earlier debt is `oid tidy`'s job.

**Triage with Jev.** Detectors have false positives (a `404` in an HTTP client is not a magic number; a single-use extraction adds indirection). One call to Jev with all the findings in scope as state and one `bool worth_fixing` question per finding filters them (§8.2). Jev no longer decides *whether* to refactor, but *which* findings are worth it.

#### Micro scale: `REFACTOR`, after each Green

It is step 5 of the article's cycle, now with a criterion:

1. Detectors on the **lines changed since the last checkpoint** (diff hunks).
2. Triage with Jev.
3. If no finding remains, the state passes without starting any agent: this is the most common case and costs no tokens.
4. If some remain, the coder-agent receives the exact list (with code snippets and the reuse catalogue) and can only write to source code.
5. Acceptance criteria (below). If not met: rollback, no retry, and the findings move to the `FR_REFACTOR` list.

#### Meso scale: `FR_REFACTOR`, when the FR is finished

With all scenarios green and before the quality gate:

1. Detectors on **the FR's whole diff**, including tests, steps, fixtures and documentation. A duplication counts if at least one of its parts is FR code: this is how a helper rewritten when it already existed in another module is detected.
2. Triage with Jev and deterministic grouping of findings into items by file and category (both sides of a duplication go together).
3. Each item is fixed by the agent that owns the files (§7.2): coder-agent for source code and its JSDoc, tdd-agent for unit tests, bdd-agent for steps and support, coder-agent for `README.md` and `docs/`.
4. One checkpoint per accepted item. An item that does not meet the criteria is discarded (rollback) and noted in the report and in the FR's commit body; `oid tidy` will find it later.

**Guarantee for refactored tests.** Refactoring tests is dangerous: a simplified test may stop testing what it tested. The check is deterministic and uses the checkpoints. In a temporary worktree with the code of the commit where the FR started, and the refactored tests, steps and `.feature` files on top:

- Every test or scenario **added in the FR** must **fail** (as it failed in its Red).
- Every test or scenario **from before the FR** must **pass**.

And with the current code, all pass. If a refactored test passes against the old code, it has stopped testing something: the item is discarded.

#### Macro scale: `oid tidy`

Periodic cleanup of the whole project, including earlier debt. It is a workflow of its own (§14.1).

#### Acceptance criteria (all three scales)

All deterministic:

- **Behaviour does not change.** Full unit suite and BDD (with regression) green. No new type errors.
- **The integrity of §6.5 holds.** A source refactor does not touch tests; a test refactor does not touch source code. If a change needs both, they are two items.
- **The item's findings disappear** and no new one appears in the touched files.
- **Nothing gets worse.** The total complexity of the touched functions and the duplicated lines do not increase.
- **No premature abstraction.** Every new exported symbol has at least two references (checked with the TypeScript language service). A non-exported helper with a single use is only accepted if the finding was about complexity.
- **The list is closed.** The DoD's `out_of_scope` check (§8.2) applies to the refactor diff: the agent cannot "take the chance" to improve other things.

These criteria also address the opposite problem, over-engineering: an abstraction that adds more than it removes rejects itself.

#### Health metrics

Every finished FR (and every `oid tidy`) appends a line to `.outside-in/metrics.jsonl` with: percentage of duplicated lines (for source code and for tests separately, so that duplication in tests does not hide the one in the code; ADR-027), maximum and mean complexity, number of unused exports and files, magic values, stale documentation, and the FR's findings (detected, resolved, discarded). The TUI shows the trend in the header of the progress view and the final report includes it (§12). Drift stops being noticed by eye every few sprints and becomes visible in every FR. The same metrics decide when to propose an `oid tidy` (§14.1).

Can be disabled per scale: `refactor.micro`, `refactor.meso` (§16).

### 6.9. Quality gate and fixes

The orchestrator first runs the project's deterministic autofixes (its formatter and its linter's automatic fixes, if it has them; §9.2) and creates a checkpoint if they changed anything. Then, the gate:

| Check | If it fails |
|:--|:--|
| Format (if the project has a formatter) | Should not happen after the autofix → internal error. |
| Lint (if the project has a linter; non-autofixable errors **new** with respect to the baseline) | `QUALITY_FIX`: task for the agent that owns the file (source code → coder, unit tests → tdd, steps → bdd) with the list of errors. |
| Types (`tsc --noEmit` on the whole project, tests included; errors **new** with respect to the baseline) | `QUALITY_FIX`, same as lint. |
| Unit / BDD | `WAITING_INPUT`: should not happen if the cycle was correct. |
| Coverage (if enabled) | `WAITING_INPUT`: code without tests indicates over-implementation. Adding tests afterwards would break test-first. |
| NFR checks (`commands.extra_checks`) | `WAITING_INPUT` with the output. |
| Traceability (§4.3) | `WAITING_INPUT`. |

`QUALITY_FIX` respects `max_retries` and integrity; after each fix the full unit and BDD suites run again before returning to the gate.

Also, to keep diffs clean, if the project has a formatter it is applied to the touched files after each agent session, before the checkpoint.

### 6.10. Retries and escalation

Each retry starts from the last checkpoint (without the failed attempt's code) and receives the normalised rejection reason and the attempt number. Effort escalates automatically:

| Attempt | Model / `thinkingLevel` |
|:--|:--|
| 1 | The one given by effort scoring (§8.4) |
| 2 | One `thinkingLevel` higher |
| 3 (last) | `models.strong` with `thinkingLevel: high` |

When retries run out, or if Jev detects a stuck loop (§8.2) → `WAITING_INPUT`.

### 6.11. Git: worktree, checkpoints and squash

**Isolation.** With `settings.isolation: "worktree"` (the default), `PREFLIGHT` creates a worktree in `settings.worktree_dir` (by default `../.oid-worktrees/<repo>/<runId>`) on a new branch `oid/<name>` (from `--branch` or, by default, `oid/run-<date>`) starting from `HEAD`. All work happens there. The user's copy is not touched, so they can keep working and a rollback never deletes anything of theirs. With `"in_place"` the work happens in the current copy, which must be clean, and the user must not modify it during the run.

**Checkpoints.** Each passed gate creates a commit on the work branch: `oid: checkpoint <FR> <state> <scenario>`. Rolling back a failed attempt is:

```bash
git reset --hard <last_checkpoint>
git clean -fd -- <write globs of the state>
```

**Squash per FR.** In `FR_COMMIT`:

```bash
git reset --soft <commit where the FR started>
git commit -m "feat(auth): FR-AUTH-01 Log in with valid credentials" -m "<scenarios, DoD warnings>"
```

The message follows `settings.commit_template`. By default, `feat(<scope>): <FR-ID> <title>`, with the `scope` derived from the ID's area in lowercase (`FR-AUTH-01` → `auth`). For `fix-bug` the type is `fix`. The article only asks for the commit to reference the FR; the exact format is configurable.

The result is a branch with **one clean commit per FR**, which the user reviews and merges (merge or MR). `oid` does not touch the main branch. The step-by-step detail remains in `events.jsonl`.

### 6.12. Human edits

When the answer to a `WAITING_INPUT` is "Edit and continue" (or in `FEATURE_REVIEW`), the human edits in the worktree (the interface shows the path and offers to open the files in `$EDITOR`). On continuing, the orchestrator:

1. Detects the changes with respect to the last checkpoint.
2. Accepts them without glob restrictions (the human is trusted), logs them as `human_edit` and creates a checkpoint `oid: human edit`.
3. Recomputes the `.feature` hashes and, if `SPEC.md` changed, goes back to `SPEC_CHECK` for the affected FRs.

### 6.13. Resuming and concurrency

- Only one run per repository: `.outside-in/lock` with the PID. If it exists and the process is alive, `oid run` fails; if the process died, `oid resume` releases it.
- `oid resume` reads `session.json`, rolls the worktree back to `lastCheckpoint` (warning if it discards changes) and re-executes the current state. If there was a pending request, it presents it again.
- `oid abort` sends a signal to the lock's process; the FSM finishes the current step and stays at the last checkpoint.

### 6.14. Baseline (frozen debt)

In real projects it is common to start with type errors, lint warnings, refactor detector findings or traceability inconsistencies unrelated to the feature at hand. Requiring everything to be clean before starting would block `oid` on almost any existing repository; ignoring it would make the gates meaningless.

`BASELINE` records in `.outside-in/runs/<runId>/baseline.json` the set of existing errors (lint and types per file, code and normalised line; refactor findings by category and symbol; traceability violations by ID). From then on, the gates judge **only what is new**: an error that was already there does not block, one introduced in the run does. It is the same criterion as Buddy's `assertNoNewBrainDamage`, where "only the files this run broke count" *(Buddy)*.

Red tests do **not** go into the baseline by default. If the human decides to continue, inherited red tests are excluded from regression, listed in the final report and treated as `test_bug` if any agent tries to use them as a Red.

---

## 7. Subagents (AgentRunner)

### 7.1. Creating sessions

Each task is a new session of `@earendil-works/pi-coding-agent`. `oid` pins **Pi 1.0.3**. The calls follow the usage that already works in Buddy (`consolidation-runner.ts`, `reflect-child.ts`, `session-boot.ts`). Those files were written against 0.84; Buddy's lockfile now resolves the package to 1.0.1, and the same tree passes an explicit `agentDir`, blocks in `beforeToolCall`, builds `tools` and `customTools` from one array, and calls `session.abort()` *(Buddy)*. Every API this spec uses exists in the 1.0 line (checked on the `v1.0.0` tag):

```typescript
import {
  createAgentSession, DefaultResourceLoader, SessionManager,
} from "@earendil-works/pi-coding-agent";

async function openAgentSession(task: AgentTask, ctx: RunContext) {
  const profile = profileFor(task.state);                         // §7.2
  const toolset = buildToolset(profile, task, ctx);               // a single array, §7.3

  const resourceLoader = new DefaultResourceLoader({
    cwd: ctx.worktree,
    agentDir: ctx.oidAgentDir,                                    // never ~/.pi/agent
    systemPromptOverride: () => renderSystemPrompt(profile),      // no skill or AGENTS.md discovery
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: ctx.worktree,
    agentDir: ctx.oidAgentDir,
    resourceLoader,
    sessionManager: SessionManager.create(ctx.worktree, ctx.runSessionsDir), // transcript for auditing
    excludeTools: ["bash"],
    tools: toolset.names,
    customTools: toolset.customTools,
    modelRuntime: ctx.modelRuntime,
    model: task.model,                                            // modelRuntime.getModel(provider, id)
    thinkingLevel: task.thinkingLevel,                            // "off" | "minimal" | "low" | "medium" | "high"
  });

  installSandbox(session, profile, ctx);                          // §7.3, beforeToolCall
  installEditRecoveryHints(session);                              // §7.4, afterToolCall
  return session;
}

async function runAgent(task: AgentTask, ctx: RunContext): Promise<AgentReport> {
  const session = await (ctx.openSession ?? openAgentSession)(task, ctx);  // injectable for tests, §19
  const events: AgentEvent[] = [];
  const unsub = session.subscribe((e) => { events.push(e); ctx.bus.forward(task, e); });
  const watchdog = startWatchdog(session, ctx.limits);            // timeout and turns → session.abort()
  try {
    await session.prompt(renderTask(task));                       // context contract, §7.8
    assertProductiveResponse(events);                             // §7.5
    recordUsage(ctx, events);                                     // §11
    return collectReport(events);                                 // from the report tool, §7.6
  } finally {
    watchdog.stop(); unsub(); session.dispose();
  }
}
```

Decisions, all learned in Buddy *(Buddy)*:

- **Its own `agentDir`, always.** Without it, the SDK's `SettingsManager` reads the user's `~/.pi/agent/settings.json`: their provider, model, thinking level and theme (Buddy's NFR-SEC-19). `oid` uses `~/.config/oid/agent` (or `$OID_AGENT_DIR`) and a test checks that every call to `createAgentSession` passes it.
- **`systemPromptOverride`.** The subagent does not inherit the user's global skills, prompts or `AGENTS.md`. If the project has an `AGENTS.md`, the orchestrator extracts the relevant style conventions and includes them explicitly.
- **Clean context, saved transcript.** Each task is a new session, but `SessionManager.create` on `.outside-in/runs/<runId>/sessions/` is used instead of `inMemory()`: the agent sees nothing of earlier sessions, and the human can open the full transcript from the interface (key `d`, §12.2) when something goes wrong.
- **`excludeTools: ["bash"]` plus an allowlist.** Double lock, as in Buddy.
- **SDK pinned at 1.0.3.** Exact version in `package.json` for `pi-coding-agent`, `pi-ai`, `pi-agent-core` and `pi-tui`. 1.0 is the version that includes the classifier API used by §8. The package has already changed scope once (`@mariozechner/*` → `@earendil-works/*`). All SDK usage stays in `agents/runner.ts` and `decisions/pi-classifier.ts`, and a compatibility test checks the shapes `oid` uses on every upgrade (§19).

### 7.2. Profiles per state

Permissions depend on the state, not only on the role: the same bdd-agent writes `.feature` files in one state and steps in another.

The globs come from `paths` (§16); default values in brackets.

| State | Role | Built-ins | Write | Read |
|:--|:--|:--|:--|:--|
| Phase 0 | spec-agent | read, grep, find, ls, write, edit | `SPEC.md`, `DOMAIN.md`, `DECISIONS.md` | the whole repo |
| `FEATURE_WRITE` | bdd-agent | read, grep, find, ls, write, edit | `bdd_features` (`features/**/*.feature`) | `SPEC.md`, `DOMAIN.md`, `bdd_features` |
| `BDD_RED` | bdd-agent | read, grep, find, ls, write, edit | `bdd_steps` (`features/steps/**`, `features/support/**`) | `bdd_features`, `bdd_steps`, `DOMAIN.md` |
| `TDD_RED` | tdd-agent | read, grep, find, ls, write, edit | `unit_tests` (`tests/unit/**`) | tests and steps |
| `CODE_GREEN`, `REFACTOR` | coder-agent | read, grep, find, ls, write, edit | `source` (`src/**`) | the whole repo |
| `FR_REFACTOR`, `QUALITY_FIX`, `oid tidy` items | the owner of the item's files | same as its profile | same as its profile; the coder-agent also `docs` (`README.md`, `docs/**`) | same as its profile |

Common rules:
- No profile has `bash`.
- Nobody writes `progress.json`, `package.json`, lockfiles, `tsconfig*.json`, the vitest and cucumber configuration, `.outside-in*` or `.git/**`.
- Nobody reads secrets: `settings.secret_globs` (by default `.env`, `.env.*`, `**/*.pem`, `**/*.key`, `**/secrets/**`, `**/auth.json`, plus `~/.ssh`, `~/.aws` and `~/.gnupg` always). It is a list with no exceptions and no confirmation, like Buddy's (FR-PERM-04). That content never reaches a model provider *(Buddy)*.
- The public signatures of `src/` are injected into the prompt; test agents do not read `src/` directly.

### 7.3. Tools and file sandbox

**A single tool array.** `createAgentSession` takes two lists: `tools` (allowlist of names) and `customTools` (definitions). The allowlist also applies to custom tools, so a tool present in one list and absent from the other **is never offered to the model, with no error or warning**, and cannot be told apart from a model that decides not to use it. `buildToolset` derives both lists from a single array *(Buddy, `buildAgentToolset`)*:

```typescript
function buildToolset(profile: StateProfile, task: AgentTask, ctx: RunContext) {
  const customTools = [reportTool(task), ...(profile.canRequestDeps ? [requestDependencyTool(ctx)] : [])];
  return { names: [...profile.builtins, ...customTools.map((t) => t.name)], customTools };
}
```

**Blocking happens in `session.agent.beforeToolCall`.** It is the mechanism Buddy uses for its permission layer: a hook chained to the previous one (Pi's extensions are also installed there) that returns `{ block: true, reason }` to prevent the call *(Buddy)*:

```typescript
function installSandbox(session: GateInstallable, profile: StateProfile, ctx: RunContext) {
  const original = session.agent.beforeToolCall;
  session.agent.beforeToolCall = async (call, signal) => {
    const prior = await original?.(call, signal);
    if (prior?.block) return prior;

    const verdict = checkPaths(profile, call.toolCall.name, call.args, ctx.worktree);
    if (verdict.block) {
      ctx.bus.emit({ type: "sandbox_denied", role: profile.role, detail: verdict.reason });
      ctx.denials.count(session);                    // > sandbox_denials_abort → session.abort()
      return verdict;                                // the reason reaches the model as the result
    }
    return prior;
  };
}
```

`checkPaths` relies on two pieces, both copied in spirit from Buddy *(Buddy)*:

- **Path argument table (`TOOL_PATH_ARGS`).** Which arguments of each tool hold a path: `read`/`write`/`edit`/`grep`/`find`/`ls` → `path`; `report` and `request_dependency` → none. An unknown tool is not treated as "no paths": a test fails if any registered tool has a path-named parameter (`path`, `file`, `dir`, `source`, `destination`…) missing from the table. That way, adding a tool cannot silently bypass the sandbox.
- **A single containment authority (`containment.ts`).** It resolves symlinks on **both sides** (the requested path and the root). For paths that do not exist yet, such as a `write` target, it resolves the nearest existing ancestor, which is where a symlink could redirect the write. String comparison is not enough: `features/../.git/config` passes a `startsWith`. Buddy had that rule written in four places that disagreed with each other, and centralised it for that reason.

Additional rules:

- `grep`, `find` and `ls` without `path` operate on the worktree root. They are treated as if they asked for the root, which is in no read profile except the coder-agent's, so they are blocked with a reason that lists the allowed paths. Without this rule, Buddy's `pathArgsOf` would return an empty list and the call would not be checked.
- Denials go back to the model as tool results. More than `limits.sandbox_denials_abort` (5) in a session aborts it with `session.abort()`.

### 7.4. Hints after a failed `edit`

A coding agent's most common failure is an `edit` whose anchor text does not match. A hook in `session.agent.afterToolCall`, deterministic and free, appends a specific hint to the error result depending on the message: "copy the anchor exactly, with spaces and line breaks", "add more surrounding lines to make it unique", "the replacement is identical to the original". It is Buddy's `edit-recovery.ts` (FR-GUARD-02), and it saves whole attempts *(Buddy)*.

### 7.5. Productive response and provider errors

`await session.prompt(...)` **resolves the same way** when the model has worked as when the provider returns a 401: the SDK reports the error as an assistant message with `stopReason: "error"` and `errorMessage`, not as a rejected promise *(Buddy, FR-CONSOL-12)*. After each `prompt`, `assertProductiveResponse` inspects the `message_end` events:

| Situation | Handling |
|:--|:--|
| Some assistant message with `stopReason: "error"` and a transient error (rate limit, 5xx, network) | Infrastructure retry with backoff (by default 3, at 5 s / 20 s / 60 s). It **does not consume** a methodology attempt (§6.10). |
| Non-transient error (authentication, unknown model, quota) | `WAITING_INPUT` with the message; retrying would burn money. |
| No assistant message, or all empty | Failed methodology attempt: the agent did nothing. |
| Session aborted by the watchdog (time or turns) | Failed attempt, with the reason. |

Only if the response is productive is the `report` examined (§7.6), and only if the `report` is consistent with the diff (§6.5) are the tests run.

### 7.6. Completion report (`report`)

```typescript
type AgentReport =
  | { status: "done"; files: string[]; summary: string; test?: string }   // test: id of the new test in TDD_RED
  | { status: "done"; files: []; summary: string; reason: "no_unit_logic_left" }
  | { status: "blocked"; reason: "spec_conflict" | "spec_gap" | "cannot_test" | "other"; detail: string };
```

- No `report` at the end of the session → failed attempt.
- In `TDD_RED`, `test` is mandatory, in the form `<file> > <describe> > <name>`. The orchestrator verifies it with `vitest list` and uses it to select that test in runs. In `BDD_RED` it is not needed: the scenario and its line are already known from the approved `.feature`.
- `blocked` with `spec_conflict`/`spec_gap` → `WAITING_INPUT`.
- `summary` is truncated and only goes to the log.

### 7.7. Dependencies (`request_dependency`)

Agents cannot edit `package.json` or the lockfile. When they need a package:

```typescript
request_dependency({ name: "undici", version?: "^7", dev: true, reason: "HTTP client for steps" })
```

Policy (`dependencies.policy`):
- `"ask"` (the default): `WAITING_INPUT` while the session waits for the answer.
- `"allowlist"`: approved if it is in `dependencies.allow`; otherwise `"ask"`.
- `"auto"`: always approved (not recommended).

Once approved, the orchestrator installs it with the project's package manager (detected from the lockfile: `npm install [-D]`, `pnpm add [-D]`, …) in the worktree and returns the result to the agent. The change goes into the next checkpoint. If the worktree was sharing `node_modules` with the main copy (§9.2), its own is materialised first.

### 7.8. Context contract

Built with deterministic code (AST, tags, IDs). Each package has a size cap; if exceeded, it is trimmed by priority and logged.

| Task | Receives | Does not receive |
|:--|:--|:--|
| `FEATURE_WRITE` | Full FR, NFRs, excerpt of `DOMAIN.md`, the project's existing `.feature` files (style), the human's comment if it is a rejection | code, tests |
| `BDD_RED` | current scenario, existing (reusable) steps, public signatures | bodies of `src/`, unit tests |
| `TDD_RED` | scenario, normalised BDD failure, names/signatures of unit tests, public signatures | bodies of `src/`, other FRs |
| `CODE_GREEN` | the red test(s) in full, normalised failure, `src/` files the test imports (transitive, capped), **reuse catalogue**, NFRs, relevant ADRs | other scenarios, earlier attempts, raw output |
| `REFACTOR` (micro) | list of findings with their snippets, affected files, reuse catalogue | tests (except names), other findings |
| `FR_REFACTOR`, `oid tidy` items | the item: its findings, the related snippets (both sides of a duplication), the affected files, reuse catalogue | whatever does not affect the item |
| `QUALITY_FIX` | list of errors, affected files | everything else |

**Reuse catalogue.** It compensates for the side effect of context isolation: the agent sees little code, so it does not know what already exists. The catalogue lists every exported symbol of the project (functions, classes, constants and types) with its signature and the first line of its JSDoc, grouped by module, without bodies. It is extracted with the TypeScript compiler API and costs few tokens. In large projects it is trimmed by priority: the same directory as the test's files, the shared modules (`shared/`, `utils/`, `lib/` or those given in `paths.shared`), and then the rest. The coder-agent's prompt includes the procedural instruction to search the catalogue before writing a new function or constant.

Human notes (free text from a `WAITING_INPUT`) are added to the next affected task.

### 7.9. Prompts

`src/agents/prompts/<state>.md`, **procedural** (concrete steps, not goals). All end with the obligation to call `report` and the reminder that the agent does not run git or tests: "the orchestrator runs them when you finish". They are versioned and validated with golden runs (§19).

Language, following Buddy's rule *(Buddy)*:

- **Prompts are always written in English, with no examples in other languages.** An English instruction illustrated with "muéstrame" is a strong signal for the model and leads it to overfit to that phrase.
- **What the agents generate** (Gherkin, test names, code, comments) uses the language in `settings.artifact_language` (English by default).
- **Test data** inside scenarios may be in the end user's language: there the goal is to exercise what a user actually types.

---

## 8. DecisionAdapter (Jev)

### 8.1. Interface and implementation

Since 1.0, Pi treats decision models as one more model type (`type: "classifier"`) and calls them with `classify()`. Jev is in the catalogue of several providers (`typesafe`, `openrouter`, `cloudflare-workers-ai`, `vercel-ai-gateway`, `opencode`), with the same credentials and the same `ModelRuntime` as the agents. `oid` needs neither the TypeSafe SDK nor a client of its own.

`oid` keeps a thin interface of its own, so the orchestrator does not depend on Pi's types and so it can be replaced in tests:

```typescript
export interface DecisionAdapter {
  evaluate<Q extends Record<string, Question>>(input: {
    purpose: DecisionPurpose;          // "red_gate", "effort", ... for logging and metrics
    state: Record<string, string>;     // context shared by every question
    questions: Q;
  }): Promise<Answers<Q>>;
}

// Same shapes as pi-ai's ClassifierQuestion
export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }               // ordered levels
  | { type: "bool"; instructions: string; criteria: { true: string; false: string } };
```

MVP implementation, `PiClassifierAdapter`:

```typescript
const model = modelRuntime.getModelOfType("classifier", cfg.provider, cfg.model);
const result = await modelRuntime.classify(model, { state, questions }, { signal });
// result.stopReason: "stop" | "error" | "aborted";  result.answers;  result.usage
```

- **Names.** Pi's API calls `bool` what Jev calls `noul` (Pi translates in the TypeSafe adapter). In this spec, `noul x` in the §8.2 catalogue is a `bool` question. Answers: `choice` returns `choice`, `probabilities` and `confidence`; `score` returns `score` and `confidence`; `bool` returns `probability`.
- **Descriptions in `bool`.** Pi asks for one criterion for `true` and another for `false`. That is an advantage: as with `choice`, describing both answers gives better-calibrated probabilities than a bare question (§8.5).
- **Errors.** `classify()` does not reject the promise on provider, authentication or response errors: it returns `stopReason: "error"`, just like chat sessions (§7.5). The adapter turns that into "no answer" and the policy in §8.6 applies.
- **Cost.** `result.usage` has the same shape as for chat messages, with the cost at catalogue price, and is added to the budget (§11).
- **Pinned model.** Thresholds are only reproducible with a specific Jev version. A versioned identifier is used when the provider offers one (`openrouter`: `typesafe/jev-1.13`; `opencode`: `jev-1.13`). The direct `typesafe` provider's catalogue only lists `jev-latest`; if that provider is used, `oid doctor` warns that the model may change, and `oid decisions` makes it possible to detect the change in the answer distribution.
- **`score` scale.** Pi returns the value the provider gives. The adapter normalises it to a 0-indexed level position (with 5 levels, 0 to 4), which is the scale the thresholds in this spec use; each provider's base is fixed in the §20 verification.

Other implementations: `FakeDecisionAdapter` (scripted answers, for tests).

**Local model, no new code.** Pi 1.0 includes `llama-cpp-classify`, which turns any chat model served by `llama-server` into a classifier with the same API: it reads the log-probabilities of a one-token label per answer. It is registered as a provider of its own (`createProvider` with `classifiers: { "llama-cpp-classify": llamaCppClassifyApi() }`) and selected in `decisions.provider` and `decisions.model`. It supports `choice` with up to 62 options and `score` with up to 10 levels. Its probabilities tend to be overconfident; a `decisions.temperature` above 1 softens them. The remaining work to use it is not integration but calibration: comparing, with `oid decisions`, its agreement with Jev and with human answers.

Default pattern: **one call per decision point**, with all its questions in parallel over the same state.

### 8.2. Catalogue

| Point | State | Questions | Policy |
|:--|:--|:--|:--|
| Spec check | FR, NFRs, glossary | `noul ambiguous`, `noul testable` | `ambiguous > 0.70` or `testable < 0.50` → `WAITING_INPUT` |
| Features written | FR, NFRs, `.feature` | `noul covers_fr`, `noul has_redundant`, `noul has_implementation_details` | `covers_fr < 0.60` or `has_implementation_details > 0.70` → retry before review. The probabilities are shown in the review. |
| Red Gate + quality | trimmed trace, test, scenario | `choice failure_kind {business_assertion, missing_implementation, test_bug, environment}`, `noul test_is_meaningful` | Class per §6.4. `test_is_meaningful < 0.50` (e.g. `expect(x).toBeDefined()` as the only check) → `test_bug`. |
| Effort | target test, signatures | `score complexity [trivial, simple, moderate, complex, algorithmic]` | §8.4 |
| Stuck loop | last 3 normalised failures | `noul same_root_cause` | `> 0.80` → `WAITING_INPUT` without exhausting retries |
| Refactor finding triage | every finding in scope, with its snippet | one `bool worth_fixing` per finding (true: fixing it simplifies or clarifies without changing behaviour; false: it is intentional, conventional, or fixing it adds indirection) | `< 0.60` → the finding is discarded (§6.8) |
| DoD | FR diff, FR, scenarios | `noul dead_code`, `noul out_of_scope`, `score spec_alignment [low, medium, high]` | **Informational**: warnings in the report and in the FR commit body |

`has_implementation_details` watches for a typical BDD mistake: scenarios written in terms of the implementation (endpoints, tables, classes) instead of observable behaviour.

The same Red Gate call adds an informational question, `noul asserts_only_absence`: "the test only checks that something does **not** happen". It does not block, but it shows up as a warning in the report and in the commit body. In Buddy, six tests in a row had to be rewritten because they had pinned a defect as if it were a requirement, and all of them were of this kind *(Buddy)*.

### 8.3. Thresholds and calibration

Initial values, configurable. Every decision is logged with its full probabilities and, if it escalated to the human, with what they answered. `oid decisions --purpose red_gate` shows the confidence distribution and the human–Jev agreement rate, which is the data for recalibrating.

### 8.4. Effort

Applies to tdd-agent and coder-agent (attempt 1; escalation is in §6.10).

| `complexity` | `thinkingLevel` | Model |
|:--|:--|:--|
| < 1.5 | `minimal` | `models.fast` |
| 1.5 – 2.5 | `medium` | `models.default` |
| > 2.5 | `high` | `models.default` |

Levels available in Pi: `off`, `minimal`, `low`, `medium`, `high`. Buddy uses `off` for its fast consolidation tier and `minimal` for reflection *(Buddy)*. `oid` does not go below `minimal` for tasks that write code. The model is resolved with `modelRuntime.getModel(provider, id)` from the configuration's `provider/id` form, and, if it is not in the immediate catalogue, with `getAvailable(provider)`.

### 8.5. State preparation

- From the trace: exception type, message and project frames (not library frames).
- Cap per field (2,000 characters).
- `criteria` always with descriptions, not bare labels: confidence improves noticeably.

### 8.6. Service failures

2 s timeout (via `signal`) and one retry. If there is no answer (timeout, or a `stopReason` other than `stop`), conservative policy: Red Gate → `test_bug` unless the deterministic layer has already decided; test quality → accepted; effort → `medium`; spec and features → `WAITING_INPUT`; stuck loop → no; refactor triage → every detector finding is kept; DoD → skipped with a warning.

---

## 9. StackAdapter (TypeScript in the MVP)

### 9.1. Interface

```typescript
export interface StackAdapter {
  readonly name: "typescript" | "python";
  prepare(worktree: string): Promise<void>;                          // worktree dependencies
  runBdd(sel?: { scenarios: ScenarioRef[] }): Promise<TestRun>;      // ScenarioRef = file + line
  runUnit(sel?: { tests: string[] }): Promise<TestRun>;
  listUnitTests(file?: string): Promise<string[]>;                   // verifies the report's id
  checkStepsLoadable(files: string[]): Promise<StepLoadIssue[]>;     // §9.2
  typecheck(scope: "source" | "all"): Promise<TypeIssue[]>;
  autofix(files?: string[]): Promise<{ changed: string[] }>;         // the project's formatter/linter, if any
  runQualityGate(): Promise<QualityReport>;
  addDependency(dep: DependencyRequest): Promise<CommandResult>;
  extractSignatures(files: string[]): Promise<Signature[]>;
  reuseCatalog(budget: number, near: string[]): Promise<CatalogEntry[]>;   // §7.8
  importsOf(testFile: string, depth: number): Promise<string[]>;
  resolveProjectSymbol(module: string, name: string): Promise<"exists" | "missing" | "external">;
  analyze(scope: AnalysisScope): Promise<Finding[]>;                 // refactor detectors, §6.8
  metrics(): Promise<HealthMetrics>;
  references(symbol: SymbolRef): Promise<number>;                   // premature abstraction, §6.8
}

export interface TestRun {
  exitCode: number; passed: number; failed: number;
  failures: NormalizedFailure[]; durationMs: number;
  loadError?: string;                  // the runner never got to execute anything
  rawOutputPath: string;               // to disk; never to memory or prompts
}

export interface NormalizedFailure {
  test: string;                         // test id or the scenario's file:line
  kind: "assertion_error" | "missing_module" | "not_a_function" | "undefined_step" | "pending"
      | "ambiguous_step" | "syntax_error" | "runtime_error" | "timeout";
  exception?: string;
  missingName?: string;                 // missing module or symbol
  message: string;                      // trimmed
  projectFrames: string[];
}
```

### 9.2. TypeScript (MVP)

Default tools, those of the closest reference project, Buddy *(Buddy)*:

| Function | Tool | How `oid` uses it |
|:--|:--|:--|
| BDD | `cucumber-js` (with `tsx`) | `commands.bdd` + `--format message:<run>/tests/<n>-bdd.ndjson` + the `file:line` locations of the selected scenarios |
| Unit | `vitest` | `commands.unit` + `--reporter=json --outputFile=<run>/tests/<n>-unit.json` + files and `-t <name>` |
| Types | `tsc --noEmit` | In `CODE_GREEN`, only new errors in `paths.source`; in the quality gate, the whole project (§6.9) |
| Format and lint | The project's own, if it has any (Biome, ESLint, Prettier; detected from their configuration) | Autofix and gate. If it has none (like Buddy), they are not checked |
| Refactor detectors | `knip`, `jscpd` and in-house analysis (§9.3) | Shipped with `oid`; the project does not need to install them |
| Other checks | `commands.extra_checks` | For example, the frontend build. Buddy added `vite build` to its quality gate because `tsc` does not check `.svelte` files, and a refactor left orphaned CSS with `tsc` green *(Buddy)* |

**Commands.** `oid init` infers them from `package.json` and from the cucumber and vitest configuration, and proposes them; they may carry environment variables. For Buddy, for example, `commands.bdd` would be `NODE_OPTIONS="--import tsx" npx cucumber-js`. `oid` appends its own arguments (output format and selection) at the end.

**Reports, not terminal text.** Verified with cucumber-js 13 and vitest 3:

- cucumber-js 13 no longer ships the `json` or `junit` formats; the structured format is `message` (NDJSON of Cucumber Messages). Each `testStepFinished` carries the step status (`PASSED`, `FAILED`, `UNDEFINED`, `PENDING`, `AMBIGUOUS`, `SKIPPED`) and, if it failed, the exception with its type and message.
- vitest with `--reporter=json` gives the result per file and per test. Load errors (missing module, syntax error) appear in the file's message, with no tests; the rest, in each test's `failureMessages`.

**Loadable steps.** If a step file **statically** imports a module or an export that does not exist yet, cucumber-js never starts: it runs no scenario, not even those already green, and writes no report. In `BDD_RED` that is the normal case, because steps are written before the code. The rule, checked deterministically before running anything (`checkStepsLoadable`, with the compiler API): in changed step files, every static import from `paths.source` must resolve to a module and exports that **already exist**. Whatever does not exist yet is imported dynamically inside the step (`await import(...)`); that way cucumber loads, the scenario fails at runtime with `Cannot find module`, and the rest of the suite keeps running. If the rule is not met, the attempt is rejected as `test_bug` with the exact list of imports to change. If cucumber still does not start (`loadError`), it is classified as `test_bug` if the error is in a changed file and as `environment` otherwise.

**Skipped scenarios.** A skipped scenario (§10.1) would have undefined steps and would break the project's suite. The orchestrator adds the `@wip` tag to it (the only change it may make to an approved `.feature`, recorded in the log), and `oid init` proposes that `commands.bdd` exclude `@wip` (`--tags "not @wip"`).

**Dependencies in the worktree.** Installing `node_modules` in every worktree can be slow and take a lot of space (Buddy includes Tauri and Svelte). If the worktree's lockfile is identical to the main checkout's, `node_modules` is a symbolic link to the main checkout's, read-only in practice because agents do not run commands. With the first new dependency, the worktree gets its own `node_modules` (`npm ci` or equivalent, using the package manager's cache) before installing it. With pnpm, the shared store makes this step cheap.

### 9.3. Analysis with the TypeScript compiler API

`oid` is written in TypeScript, so analysis of the project's code happens in-process, with the classic compiler API (a `Program` over the project's `tsconfig.json`) and its language service. No external script is needed. The analysis engine is `typescript@6.0.3`, a runtime dependency under an npm alias, separate from the TypeScript 7 that compiles `oid` itself: TypeScript 7 only offers an API marked unstable (ADR-027). It provides:

- **Signatures** of exported symbols, with their types and the first line of the JSDoc. Never bodies.
- **Reuse catalogue** (§7.8).
- **Transitive imports** of a test, for the coder-agent's context contract.
- **Symbol resolution**, to classify `is not a function` and `Cannot find module` in the Red Gate (§6.4) and for the loadable-steps rule.
- **In-house detectors**: cyclomatic complexity and nesting per function, magic values and stale JSDoc (§6.8).
- **References** of a symbol (`findReferences`), for the premature-abstraction criterion.

`knip` (unused exports, files and dependencies) and `jscpd` (duplication) run as processes, from `oid`'s own dependencies, with configuration generated by `oid`. `knip`'s entry points are inferred from `package.json` and the test commands, and can be adjusted in `refactor.entry` for projects with unconventional entries (Buddy has a worker and a Svelte frontend).

### 9.4. Python (post-MVP)

Same contract. Tools: `uv` for dependencies, `pytest-bdd` for BDD, `pytest` for unit tests, `ruff` for format and lint, `mypy` for types; as detectors, `vulture` (dead code), `pylint` R0801 or `jscpd` (duplication), `radon` (complexity), `ruff` PLR2004 (magic values) and D417 (docstrings). Signatures and catalogue via an `ast` script packaged with `oid`.

`pytest-bdd` conventions: one bindings file per `.feature`, with **one test per scenario** via `@scenario(...)`; `scenarios(...)` is not used, since it would bind at once scenarios not yet implemented. Normalisation starts from JUnit XML.

Red Gate signals (§6.4): `SyntaxError` or `IndentationError` in a test, `StepDefinitionNotFoundError` and `pending` tests → `test_bug`; `ImportError`, `ModuleNotFoundError`, `AttributeError` or `NameError` whose missing name belongs to the project → `missing_implementation` (the most common Red in TDD with pytest: the function does not exist yet and collection fails); `ModuleNotFoundError` for an external package → `environment`; `AssertionError` → candidate for `business_assertion`.

---

## 10. Human feedback (`WAITING_INPUT`)

### 10.1. Triggers and actions

| Trigger | Actions |
|:--|:--|
| `BASELINE` red | View failures · Continue ignoring those tests · Abort |
| Ambiguous or untestable spec | Edit and continue · Continue anyway · Skip FR · Abort |
| Feature review | Approve · Edit and approve · Reject with comment |
| Subagent `blocked` | Edit and continue · Retry with note · Skip scenario · Skip FR |
| Retries exhausted / stuck loop | Retry with note · Rewrite the last test · Skip scenario · Skip FR · Abort |
| Repeated ambiguous Red Gate | It is a valid Red · It is a test bug · View trace |
| Dependency requested | Approve · Reject with note |
| Quality gate not fixable | View output · Edit and continue · Abort |
| Budget exhausted | Extend · Abort |

Semantics of "skip". It respects the `done` rule of §4.4 (every scenario in `pass`) and the article's schema, which has no states or fields for a skip:
- **Skip scenario:** the scenario stays in `fail` or `pending`, gets the `@wip` tag (§9.2) and is excluded from regression. The FR's other scenarios continue. At the end, the FR can **not** move to `done`: it stays `in_progress` at the `cycle_step` it was at, and the reason goes to `events.jsonl` and to the final report. Its partial work is kept in a `wip(<scope>): <FR-ID> …` commit on the run's branch.
- **Skip FR:** the FR goes back to `pending` (without `cycle_step` or `scenarios`); its changes are discarded (rollback to the start of the FR) and the run continues with the next one. The reason is recorded in `events.jsonl` and in the report.
- **Rewrite the last test:** rollback to the checkpoint before the last `TDD_RED` and a new `TDD_RED` with the note.

### 10.2. Mechanics

```typescript
interface InputRequest {
  id: string;
  kind: InputKind;
  prompt: string;
  context: { failure?: NormalizedFailure; files?: string[]; decision?: DecisionLog; worktree: string };
  actions: { key: InputAction; label: string }[];   // the FSM translates each action into transitions
  allowFreeText: boolean;
}
```

- The FSM creates a Promise per `id` and emits `waiting_input`. The terminal interface presents it in conversation mode (§12.2); the first valid answer resolves it and `input_resolved` is emitted. Post-MVP, the web dashboard is a second channel over the same mechanism.
- Answers with an expired `id`, or duplicates, are ignored.
- Without a TTY (and, post-MVP, without a dashboard), the session is saved and the process exits with code 3; `oid resume` presents it again.
- Every `waiting_input` triggers `notify_command` (§12.3).

---

## 11. Budget and limits

| Limit | Scope | Default |
|:--|:--|:--|
| `max_retries` | per state | 3 |
| `max_inner_iterations` | per scenario | 8 |
| `agent_timeout_s` | per session | 600 |
| `agent_max_turns` | per session | 40 |
| `command_timeout_s` | per command | 120 |
| `sandbox_denials_abort` | per session | 5 |
| `cost_limit_usd` | per FR and per run | no limit |

Cost is computed by adding up, on every `message_end` event of an assistant message, `usage.cost.total` and `usage.totalTokens`, which is how Buddy's `usage-tracker.ts` does it *(Buddy)*. The cost of Jev calls is added to that. The budget is checked **before every billable call**, not only when the run starts: Buddy added that check after a consolidation cascade already in progress went over the limit (FR-COST-05).

---

## 12. EventBus, interface and report

### 12.1. Events

```typescript
type OIEvent = { ts: number; runId: string } & (
  | { type: "state_change"; from: State; to: State; reason: string; fr?: string; scenario?: string }
  | { type: "decision"; purpose: DecisionPurpose; answers: unknown; latencyMs: number; escalated: boolean }
  | { type: "agent_start"; state: State; role: AgentRole; attempt: number; model: string; thinkingLevel: string }
  | { type: "agent_tool"; role: AgentRole; tool: string; path?: string }
  | { type: "agent_end"; role: AgentRole; report: AgentReport; usage: Usage }
  | { type: "sandbox_denied" | "integrity_violation"; role: AgentRole; detail: string }
  | { type: "dependency"; request: DependencyRequest; outcome: "approved" | "rejected" }
  | { type: "test_run"; runner: "bdd" | "unit"; summary: Omit<TestRun, "rawOutputPath">; runRef: string }
  | { type: "quality_gate"; report: QualityReport }
  | { type: "refactor_findings"; scale: "micro" | "meso" | "tidy"; detected: number; kept: number; findingsRef: string }
  | { type: "refactor_item"; scale: "micro" | "meso" | "tidy"; item: string; outcome: "accepted" | "rejected"; reason?: string }
  | { type: "metrics"; snapshot: HealthMetrics; delta: Partial<HealthMetrics> }
  | { type: "checkpoint" | "rollback" | "fr_commit" | "human_edit"; hash: string; message: string }
  | { type: "waiting_input"; request: InputRequest }
  | { type: "input_resolved"; id: string; via: "tui" | "web"; action: string; text?: string }
  | { type: "error"; message: string; detail?: string }
);
```

Everything is written to `.outside-in/runs/<runId>/events.jsonl`, whether there is an interface or not. The terminal interface, the no-TTY mode and (post-MVP) the web dashboard are views over this stream: none of them holds state of its own that the orchestrator needs.

`agent_tool` events are built from the SDK's `tool_execution_start` and `tool_execution_end`. The end event **carries no arguments** (only `toolCallId`, `toolName`, `result` and `isError`), so the path is obtained by pairing it with its start event by `toolCallId`, in a single place *(Buddy, `SessionTracker`)*.

### 12.2. Terminal interface

A modern interface, in the style of Pi or Claude Code, with two modes: **progress** while the cycle advances on its own, and **conversation** when a person is needed.

**Technical base: `@earendil-works/pi-tui`.** It is a standalone terminal framework, not just Pi's interface: flicker-free differential rendering, components (`Text`, `Markdown`, `Loader`, `SelectList`, `Editor`, `ScrollView`, `VStack`/`HStack`, `Box`…), overlays, focus, keyboard and mouse. It can be used on the main screen (`TuiMainScreen`, keeps the scrollback) or on the alternate screen (`TuiAltScreen`). In addition, `pi-coding-agent` exports its chat components (`AssistantMessageComponent`, `UserMessageComponent`, `ToolExecutionComponent`, `renderDiff`, `highlightCode`, the theme) for reuse. Using the same base as Pi gives an interface consistent with the one already used in Phase 0 without building it from scratch.

The interface subscribes to the `EventBus` and never modifies state: it reads events and, in conversation mode, returns an answer to the `InputRequest`.

#### Progress mode

A compact view updated in place, not a scroll of lines:

```
 oid · FR-SHORTEN-01 Shorten a URL                          2/5 FRs · 4m12s · $0.38
 health: dup 2.1% (+0.3) · max cc 9 · unused 0 · magic 1
 ─────────────────────────────────────────────────────────────────────────────────
 ⠋ CODE_GREEN  coder-agent · attempt 2/3 · medium · 0:41
     edit src/shortener/codes.ts

   ✓ Shorten a valid URL
   ● Same URL returns same code         tdd: 2 tests · last: AssertionError
   ○ Reject invalid URLs

   jev  red_gate        missing_implementation  0.94
   jev  effort          moderate (2.1)
   git  checkpoint      tdd_red · Same URL returns same code
 ─────────────────────────────────────────────────────────────────────────────────
 d detail · l log · a abort
```

- Header: current FR, run progress, time and cost, and a code-health line with the change since the start of the run (§6.8).
- FSM state with a spinner, the active agent, its attempt, reasoning level and the file it is touching.
- The FR's scenarios with their state and the last failure, summarised.
- The latest Jev decisions and git events, one line each.
- Keys: `d` opens the detail of the last event (full trace, diff, agent transcript), `l` the full log with scrolling, `a` aborts after the current step.

#### Conversation mode

When the FSM emits `waiting_input`, the progress view collapses to one line and the request takes over the screen. Not every interaction is the same:

| Type | Interface |
|:--|:--|
| Simple decision (dependency, ambiguous Red, budget) | A card with the context and the actions in a `SelectList`; optional note field. |
| Feature review | The FR's `.feature` files with highlighting, Jev's scores alongside, and actions: approve, reject with comment, open in `$EDITOR` and approve. |
| Problems worth talking through (ambiguous spec, agent blocked by a conflict, stuck loop, quality gate not fixable) | The same actions, plus **Talk it through**: opens a chat with an agent that has the problem's context loaded. |

**"Talk it through".** A chat session inside `oid`'s own interface, built with Pi's chat components and an SDK session created as in §7.1, with:

- Context: the full `InputRequest` (normalised failure, files, Jev decision) and the FR.
- Read tools over the worktree, and write access **only** to what belongs to the problem: `SPEC.md` for an ambiguous spec or a conflict, nothing in the other cases. The sandbox is the same as in §7.3.
- A `resolve({ action, note })` tool with the same actions as the `InputRequest`. The conversation ends when the human picks an action, directly or by asking the agent for it; the FSM receives it like any other answer, with the note for the next attempt.

This way a problem can be reasoned through with help, and the spec edited if needed, without the conversational agent bypassing the flow: the decision is still one of the actions the FSM offers. Changes to `SPEC.md` are treated as a human edit (§6.12).

Once the request is resolved, progress mode returns.

#### No TTY

If the output is not a terminal (a pipe, CI), the same information is emitted as one line of text per relevant event. A `waiting_input` without a TTY saves the session and exits with code 3 (§10.2).

### 12.3. Notifications

`settings.notify_command`, if defined, runs on every `waiting_input`, when the run finishes and on errors, with `OID_EVENT`, `OID_MESSAGE` and (post-MVP) `OID_URL` in the environment: for example `notify-send` or a `curl` to a push service. It is what makes an unattended run useful without a dashboard.

### 12.4. Final report

On reaching `DONE` (or `ABORTED`), `report.md` and a summary in the terminal: FRs completed, with skips and pending ones; scenarios by state; DoD warnings; refactor (findings detected, resolved and discarded, per scale); health metrics and their trend; human interventions; retries per state; cost; the resulting branch and how to merge it; and, if any trigger is met, the proposal to launch `oid tidy`.

### 12.5. Web dashboard (post-MVP)

Another view over the same `EventBus`, to follow a run from the browser or a phone and see it with more room. It will be enabled with `oid run --dashboard` (or `oid dashboard` over a running or past run). Native Node HTTP.

| Endpoint | Function |
|:--|:--|
| `GET /` | Single page (HTML with inline JS and CSS). |
| `GET /api/events` | SSE. On connect, replays the run's `events.jsonl` and then the new ones. |
| `GET /api/state` | FSM state, current FR and scenario, budget, pending request, worktree path. |
| `GET /api/progress` | `progress.json` with the files and lines of each scenario. |
| `GET /api/file?path=` | A worktree file, only inside the `paths` globs, never secrets. |
| `GET /api/run/:n/:runner` | Raw output of a test run. |
| `GET /api/diff?fr=` | The FR's diff (or the current FR's against its start). |
| `POST /api/input` | `{ id, action, text? }` |
| `POST /api/abort` | Orderly stop after the current step. |

Security: listens on `127.0.0.1` by default (`--host 0.0.0.0` to view it from another device); a random per-run token included in the printed URL and required on `/api/*`.

Planned views: cycle map; traceability FR → scenarios → tests (the Gherkin of green scenarios as a list of implemented features; failure, output and Jev decision for red ones); feature review; timeline; active agent; diff; feedback card; budget. Data from real MVP runs will decide which ones are worth it.

---

## 13. Phase 0 (`oid spec`)

Always interactive and in a dedicated session, so that research and brainstorming do not consume the implementation cycle's context.

```
oid spec              # Full Phase 0 (new-project) or extension of SPEC.md
oid spec --fr         # Add or refine a specific FR (MVP)
```

- **Interface: Pi's full interactive mode.** `pi-coding-agent` exports `InteractiveMode` for programmatic use. It takes an `AgentSessionRuntime`, which `oid` builds with `createAgentSessionRuntime` and `createAgentSessionServices`, so the session carries `oid`'s `agentDir`, the spec-agent's system prompt, its tools and its model (§7.1). The human gets Pi's whole chat experience (history, editing, commands, Markdown) and `oid` only contributes the profile and the gate.
- **In a child process.** On leaving the chat (`/quit`, Ctrl+D), `InteractiveMode` calls `process.exit(0)`: it is not designed to hand control back to whoever launched it. That is why `oid spec` runs it in a child process (`oid __spec-session`, an internal entry point) that inherits the terminal. The parent process waits for it to finish and then runs the exit gate. This way leaving the chat cannot kill `oid`.
- **Sandbox as an extension.** Inside interactive mode, the runtime can replace the active session (for example, with `/new`), and a hook installed by hand on `session.agent.beforeToolCall` would be lost. The spec-agent's sandbox is registered as an **extension** (`pi.on("tool_call", …)`, which according to Pi's documentation can block the call, and which blocks by default if the handler fails), and extensions survive the session change. It uses the same `checkPaths` function as §7.3. The cycle's subagents, which do not change session, keep using `beforeToolCall`, the mechanism already proven.
- **`/check` command.** An extension registers `/check`, which runs the gate's deterministic checks inside the chat and shows the gaps, so the human does not have to leave to know what is missing.
- Web search may be enabled in this phase.
- The human edits the documents freely during and after the conversation.
- **Exit gate**, when the session closes:
  - Deterministic: files present; `SPEC.md` parses (§4.2); unique IDs; no acceptance criteria in the FRs.
  - Jev: the article's six questions (goal, MVP, out of scope, cross-cutting rules, domain, stack) as `noul`; low ones are shown as a list of gaps.
  - Explicit confirmation from the human. No threshold replaces it.
- On confirmation, `progress.json` is created or updated (new FRs in `pending`) and the design artifacts are committed on the user's current branch. It is the only commit `oid` makes outside its working branch, and it is explicit.

---

## 14. Other workflows

### 14.1. Periodic cleanup: `oid tidy` (MVP)

The cleanup that, without `oid`, ends up being requested from the agent by hand every few sprints: dead code, stale documentation, duplication, simplifications and hardcoded values that should be constants. Micro and meso refactors (§6.8) only look at what changes in the run; `oid tidy` looks at **the whole project, existing debt included**.

```
TIDY_ANALYZE ─▶ TIDY_TRIAGE ─▶ TIDY_PLAN ─▶ TIDY_REVIEW ─▶ (per item) TIDY_ITEM ─▶ TIDY_VERIFY ─▶ TIDY_COMMIT ─▶ … ─▶ DONE
```

| State | What happens |
|:--|:--|
| `TIDY_ANALYZE` | Detectors (§6.8) over the whole project, or over the `--scope` paths. Metrics snapshot. |
| `TIDY_TRIAGE` | Jev discards false positives (`worth_fixing`, §8.2). |
| `TIDY_PLAN` | A read-only agent groups the findings into **small, independent items** ("extract the three copies of the URL validation into a helper", "move the timeouts to `constants.ts`", "update the README's configuration section"). Each item declares its findings, its files and its type (`refactor` or `docs`). The orchestrator validates that every cited finding exists and that no item mixes source code and tests (§6.8). Items are prioritised by impact (findings resolved, duplicated lines removed) and cut to `refactor.tidy.max_items`. |
| `TIDY_REVIEW` | The human reviews the plan in the TUI, like features: approve, remove or reorder items, or add a note to one. With `--yes` it is approved without review. |
| `TIDY_ITEM` | The agent that owns the files (§7.2) resolves the item, with its context (§7.8). Beforehand, it is re-checked that its findings still exist: an earlier item may have resolved them. |
| `TIDY_VERIFY` | The acceptance criteria of §6.8. For items that touch tests, the meso refactor guarantee does not apply (old tests have no recorded Red), so it is replaced by a deterministic rule: the same test ids before and after (none disappears or is renamed without approval in the review) and, per test, the same number of assertions or more (`expect`, `assert`), counted on the AST. If not met: rollback and next item. |
| `TIDY_COMMIT` | One commit per item: `refactor(<scope>): <title>` or `docs: <title>`, with the resolved findings in the body. |

Details:

- **Same infrastructure** as `oid run`: worktree, its own branch (`oid/tidy-<date>`), checkpoints, baseline, interface, budget and feedback. The result is a branch with one commit per item, to review and merge.
- **What `oid tidy` does not touch.** `SPEC.md`, `DOMAIN.md` and `DECISIONS.md` belong to the human and to Phase 0. If the detectors find that they mention symbols that no longer exist, these are listed in the report as drift to review, without editing them.
- **When it is proposed.** It can always be launched by hand. In addition, when an `oid run` finishes, the interface offers to launch it if any condition in `refactor.tidy.triggers` is met: `every_frs` FRs have passed since the last cleanup, or some metric has worsened by more than its threshold since then (for example, +1.5 points of duplication). It does not launch by itself: reviewing the plan is part of the value.
- **Discarded items.** They are listed in the report with the reason for rejection. If a finding is discarded twice in a row, `oid tidy` stops proposing it and records it as accepted debt in `.outside-in/metrics.jsonl`, until its code changes.

### 14.2. `fix-bug` (post-MVP)

The same test-first principle as in `new-feature`: **production code is not touched until a test demonstrates the failure**. The failing test *is* the bug reproduction; if a failing test cannot be written, the bug is not understood.

```
REPRO ─▶ LOCATE ─▶ TEST_KIND ─▶ (regression | fix_existing | missing) RED ─▶ CODE_GREEN ─▶ QUALITY_GATE ─▶ FR_COMMIT
```

- `REPRO`: the human provides the report, log or steps to reproduce. Jev classifies severity and area. No code is run and no changes are applied; the goal is to understand what happens and under which conditions.
- `LOCATE`: a read-only agent analyses the code and proposes the affected modules. It writes nothing.
- `TEST_KIND`: Jev decides which kind of test is needed to capture the bug:
  - **Regression test** (the usual case): a new test that reproduces the faulty scenario and fails because the bug exists. It is the default.
  - **Missing test**: a unit test that should have existed and would have caught the edge case. It is written and fails.
  - **Fix existing test** (rare): an existing test is wrong in the face of a legitimate behaviour change. It **always** requires human confirmation: it is the only situation in which modifying an existing test is allowed, and exactly the door to *test cheating*.
- `RED`: the test agent writes the chosen test. The runner executes it and it **must fail**, confirming that the test captures the bug. If it passes, the test does not reproduce the problem: rollback and retry. The Red Gate applies the same layers as in `new-feature` (§6.4).
- `CODE_GREEN`: only now, with a red test that demonstrates the failure, the coder-agent fixes the minimum code to make it green.
- `QUALITY_GATE`: verifies that the fix breaks nothing existing (full regression).
- Commit: `fix(<scope>): <ID> <description>`.

One lesson from Buddy is covered by construction: "reintroduce the bug to check the test", because a test written **after** a fix often passes even if the fix is removed *(Buddy)*. In `oid` the test is written and confirmed red **before** the code is touched, and the coder-agent cannot modify it afterwards (§6.5), so that verification is already done.

### 14.3. `new-project` (post-MVP)

Full Phase 0 + deterministic scaffolding (`package.json`, `tsconfig.json`, structure, cucumber-js and vitest configuration) + the normal cycle over the MVP's FRs.

---

## 15. CLI

| Command | Function |
|:--|:--|
| `oid init [--import-progress [PATH]]` | Creates `.outside-in.json`, detecting the stack, the paths (from `tsconfig.json`'s `include` and the cucumber and vitest configuration) and the commands (from `package.json`'s scripts). Adds `.outside-in/` to `.gitignore` and initialises `progress.json` from `SPEC.md` if it does not exist. With `--import-progress`, converts a `progress.json` with another schema (below), read from `PATH` or found at `progress.json` or `specs/progress.json`, and writes it beside the spec (`paths.progress`). |
| `oid spec [--fr ID]` | Interactive Phase 0. |
| `oid tidy [--scope PATH…] [--max-items N] [--yes]` | Periodic project cleanup (§14.1). |
| `oid metrics [--since DATE] [--changed]` | Code health metrics and their trend (§6.8). With `--changed`, only the findings on lines changed since the last commit or checkpoint. |
| `oid verify red <test>` · `green` · `integrity [--step S]` | The Red Gate (§6.4), Green-with-regression (§6.7) and integrity (§6.5) checks as standalone commands. Used by the FSM and, during bootstrap, by an agent guided by instructions (see `docs/BOOTSTRAP.md`). |
| `oid run [--fr ID…] [--max-frs N] [--branch NAME]` | Processes pending FRs in order (or only the given ones), with the interface of §12.2. Post-MVP: `--dashboard [--host H] [--port P]`. |
| `oid resume` | Continues from `session.json`. |
| `oid status` | State, FR, scenario, budget, pending request, worktree. |
| `oid abort` | Orderly stop. |
| `oid watch [--run ID]` | Opens the progress interface over a running run (from another terminal) or replays a past one from its `events.jsonl`. Post-MVP, `oid dashboard` will do the same in the browser. |
| `oid decisions [--purpose P]` | History of Jev decisions, for calibration. |
| `oid doctor` | Tools, credentials, connectivity with Pi and Jev. |
| `oid clean [--run ID]` | Removes worktrees and data of finished runs. |
| `oid progress <subcommand>` | Reads and writes `progress.json` with the rules of §4.4 (below). |
| `oid --help`, `oid <command> [<subcommand>] --help` | Prints what the command does, its subcommands, arguments and options, and exits 0 (FR-CLI-01). |
| `oid check` | Consistency checks of `progress.json` and traceability (§4.3), without running anything else. Useful in CI and in projects that do not use `oid run`. |

`oid progress` reads and writes `progress.json` with the schema and transitions of §4.4:

```
oid progress current | status [--all] | show FR-xxx
oid progress add FR-xxx "Title"             # the FR must exist in SPEC.md
oid progress focus FR-xxx
oid progress step FR-xxx <cycle_step>       # rejects invalid transitions
oid progress scenario pass|fail|pending FR-xxx "Scenario name"
oid progress done FR-xxx                    # rejects if any scenario is not in pass
```

It is the progress tool the article announces as pending ("a cycle tracker"). It serves an agent guided by instructions in an `AGENTS.md` just as it serves `oid`: both use the same tool for state. Internally it is the same `artifacts/progress.ts` module the FSM uses, so there are no two implementations of the rules that could diverge. The idea of giving agents a CLI with guards instead of letting them edit the JSON comes from Buddy's `scripts/progress.ts` *(Buddy)*.

**Projects that already follow the methodology with another schema.** Buddy, for example, has a `progress.json` that predates the article's format, managed by its own `scripts/progress.ts`. `oid init --import-progress` converts it once and shows what cannot be carried over: `status` `blocked` and `deferred` become `pending`; `cycle_step` `spec_review` → `select`, `bdd_red` → `bdd_red`, `implementing` → `tdd_red`, `bdd_green` → `quality_gate`; `unit_tests` and `note` are dropped (listed in the output). From then on, the project uses `oid progress` instead of its script. Old FRs and `.feature` files that do not follow the article's format remain as frozen debt (§6.14); new FRs are written in the article's format and live alongside them in the same `SPEC.md`, because the parser only recognises `### FR-…:` headings (§4.2).

Exit codes: `0` completed · `1` error · `2` aborted · `3` waiting for input with no channel · `4` budget exhausted.

---

## 16. Configuration (`.outside-in.json`)

Validated with Zod at startup.

```json
{
  "version": 1,
  "stack": "typescript",
  "paths": {
    "source": ["src/**"],
    "shared": [],
    "unit_tests": ["tests/unit/**"],
    "bdd_features": ["features/**/*.feature"],
    "bdd_steps": ["features/steps/**", "features/support/**"],
    "docs": ["README.md", "docs/**"],
    "spec": "SPEC.md",
    "design": ["SPEC.md", "DOMAIN.md", "DECISIONS.md"],
    "progress": "progress.json"
  },
  "commands": {
    "bdd": "NODE_OPTIONS=\"--import tsx\" npx cucumber-js --tags \"not @wip\"",
    "unit": "npx vitest run",
    "typecheck": "npx tsc --noEmit",
    "format": null,
    "lint": null,
    "coverage": null,
    "extra_checks": []
  },
  "models": {
    "fast": "<provider/fast model>",
    "default": "<provider/default model>",
    "strong": "<provider/most capable model>",
    "spec": "<provider/model for Phase 0>"
  },
  "decisions": {
    "provider": "openrouter",
    "model": "typesafe/jev-1.13",
    "temperature": null,
    "thresholds": {
      "red_gate": 0.80,
      "test_meaningful": 0.50,
      "spec_ambiguous": 0.70,
      "spec_testable": 0.50,
      "features_cover": 0.60,
      "finding_worth": 0.60,
      "stuck_loop": 0.80
    }
  },
  "refactor": {
    "micro": true,
    "meso": true,
    "entry": [],
    "detectors": {
      "complexity": { "max_cyclomatic": 10, "max_depth": 4 },
      "duplication": { "min_lines": 6, "min_tokens": 50 },
      "dead_code": true,
      "magic_value": { "ignore": [0, 1, -1], "min_string_repeats": 3 },
      "doc_drift": true
    },
    "tidy": {
      "max_items": 15,
      "triggers": {
        "every_frs": 3,
        "duplication_pp": 1.5,
        "max_cyclomatic": 2,
        "unused_exports": 5
      }
    }
  },
  "limits": {
    "max_retries": 3,
    "max_inner_iterations": 8,
    "agent_timeout_s": 600,
    "agent_max_turns": 40,
    "command_timeout_s": 120,
    "sandbox_denials_abort": 5,
    "cost_limit_usd": null
  },
  "dependencies": {
    "policy": "ask",
    "allow": [],
    "share_node_modules": true
  },
  "settings": {
    "review_features": "upfront",
    "isolation": "worktree",
    "worktree_dir": "../.oid-worktrees",
    "branch_prefix": "oid/",
    "commit_template": "{type}({scope}): {id} {title}",
    "artifact_language": "en",
    "secret_globs": [".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/auth.json"],
    "notify_command": null,
    "tui_screen": "main",
    "dashboard_port": 3333
  },
  "integrity": {
    "forbidden_in_src": ["@ts-ignore", "@ts-expect-error", "process.env.VITEST", "import.meta.vitest", "NODE_ENV === \"test\""],
    "forbidden_in_tests": [".only(", ".skip(", ".todo(", "readFileSync"]
  },
  "infra_retry": {
    "attempts": 3,
    "delays_s": [5, 20, 60]
  }
}
```

Notes:

- `paths.source` accepts several roots. For Buddy they would be `backends/**`, `shared/**` and `src/**`, with `shared/**` also in `paths.shared` for the reuse catalogue; `oid init` infers this from `tsconfig.json`'s `include`.
- `integrity.forbidden_in_tests` with `readFileSync` applies only when the path read is inside `paths.source` (checked on the AST); tests may read fixtures.
- `refactor.tidy.triggers` is measured from the last `oid tidy` run: `duplication_pp` in percentage points; `max_cyclomatic` as an increase in maximum complexity; `unused_exports` as an absolute increase.

Credentials: never in this file. Provider credentials (including the one serving Jev, e.g. `OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`) are resolved as in Pi: from the auth storage of `oid`'s own `agentDir` (`~/.config/oid/agent/auth.json`) or from the provider's variables. `oid doctor` offers to import those in `~/.pi/agent` once, explicitly, instead of reading them on every run.

---

## 17. Session state (`.outside-in/session.json`)

```json
{
  "runId": "2026-10-02T21-30-00Z-a1b2",
  "mode": "new-feature",
  "state": "CODE_GREEN",
  "targetFrs": ["FR-AUTH-01", "FR-AUTH-02"],
  "fr": "FR-AUTH-01",
  "frStartCommit": "4d1a9b0",
  "worktree": "../.oid-worktrees/my-project/2026-10-02T21-30-00Z-a1b2",
  "branch": "oid/run-2026-10-02",
  "baseCommit": "9f2c1e7",
  "lastCheckpoint": "e3b0c44",
  "scenario": { "index": 0, "name": "Valid login returns a token", "location": "features/auth.feature:4" },
  "scenarioUnitTests": {
    "Valid login returns a token": ["tests/unit/auth.test.ts > credentials > accepts valid ones", "tests/unit/tokens.test.ts > issues a token"]
  },
  "pendingFindings": [".outside-in/runs/2026-10-02T21-30-00Z-a1b2/findings/7.json"],
  "baseline": ".outside-in/runs/2026-10-02T21-30-00Z-a1b2/baseline.json",
  "innerIteration": 2,
  "attempt": 2,
  "featureHashes": { "features/auth.feature": "sha256:…" },
  "pendingInput": null,
  "usage": { "costUsd": 0.42, "agentSessions": 7, "decisions": 12 }
}
```

The full history lives in `events.jsonl`; `session.json` holds only what is needed to resume.

---

## 18. Repository layout

```
outside-in-dev/
├── src/
│   ├── cli.ts                        # compiled to dist/cli.js (package.json bin.oid)
│   ├── config.ts                     # Zod schema
│   ├── orchestrator/
│   │   ├── machine.ts                # FSM loop
│   │   ├── states/                   # one handler per state
│   │   ├── session.ts                # atomic writes
│   │   ├── lock.ts
│   │   ├── budget.ts
│   │   ├── escalation.ts             # retries and model escalation
│   │   └── input.ts                  # WAITING_INPUT: Promise shared by CLI/web
│   ├── agents/
│   │   ├── runner.ts                 # single point of contact with the Pi SDK
│   │   ├── toolset.ts                # one array → tools + customTools
│   │   ├── profiles.ts               # per-state profiles
│   │   ├── sandbox.ts                # beforeToolCall hook
│   │   ├── containment.ts            # single path authority (symlinks on both sides)
│   │   ├── tool-paths.ts             # TOOL_PATH_ARGS
│   │   ├── edit-hints.ts             # afterToolCall hook
│   │   ├── response-check.ts         # assertProductiveResponse + error classification
│   │   ├── usage.ts                  # cost from message_end
│   │   ├── tools/report.ts
│   │   ├── tools/request-dependency.ts
│   │   ├── context/                  # per-task context contract
│   │   └── prompts/                  # *.md per state (in English)
│   ├── decisions/
│   │   ├── adapter.ts
│   │   ├── pi-classifier.ts          # modelRuntime.classify()
│   │   ├── fake.ts
│   │   ├── catalog.ts
│   │   └── state-prep.ts
│   ├── artifacts/
│   │   ├── spec-parser.ts            # IDs wherever they are (§4.2)
│   │   ├── gherkin.ts                # effective tags
│   │   ├── traceability.ts
│   │   ├── baseline.ts               # frozen debt (§6.14)
│   │   └── progress.ts               # progress rules; used by the FSM and `oid progress`
│   ├── stack/
│   │   ├── adapter.ts
│   │   ├── exec.ts                   # timeout and process group
│   │   ├── typescript/
│   │   │   ├── index.ts
│   │   │   ├── cucumber-messages.ts  # NDJSON → NormalizedFailure
│   │   │   ├── vitest-json.ts        # JSON report → NormalizedFailure
│   │   │   ├── classify.ts           # Red Gate deterministic layer
│   │   │   ├── program.ts            # TypeScript Program and language service
│   │   │   ├── steps-loadable.ts     # §9.2
│   │   │   ├── worktree-deps.ts      # shared or own node_modules
│   │   │   └── detectors/            # complexity, magic values, doc_drift; knip and jscpd
│   │   └── python/                   # post-MVP
│   ├── refactor/
│   │   ├── findings.ts               # normalisation, baseline, diff scope
│   │   ├── items.ts                  # grouping into items
│   │   ├── acceptance.ts             # §6.8 criteria
│   │   ├── test-guarantee.ts         # refactored tests against the previous code
│   │   ├── metrics.ts                # metrics.jsonl and tidy triggers
│   │   └── tidy.ts                   # `oid tidy` workflow
│   ├── git/
│   │   ├── worktree.ts
│   │   ├── checkpoints.ts            # checkpoint, rollback, squash
│   │   └── integrity.ts
│   ├── events/
│   │   ├── bus.ts
│   │   ├── jsonl.ts
│   │   └── notify.ts
│   ├── report/final-report.ts
│   ├── ui/                           # terminal interface (pi-tui)
│   │   ├── app.ts                    # switches progress / conversation mode
│   │   ├── progress-view.ts
│   │   ├── input-card.ts             # simple decisions and feature review
│   │   ├── talk-session.ts           # "Talk it through": chat with context and resolve tool
│   │   ├── plain.ts                  # no-TTY output
│   │   └── spec-session.ts           # internal entry `oid __spec-session` (InteractiveMode)
│   └── dashboard/                    # post-MVP
│       ├── server.ts
│       └── index.html
├── features/                         # oid's own acceptance scenarios
│   ├── steps/
│   └── support/
├── tests/
│   ├── fixtures/                     # sample TypeScript projects
│   └── unit/                         # vitest, tests/unit/**/*.test.ts
├── package.json
└── tsconfig.json
```

---

## 19. Testing the CLI itself

1. **Unit (no network):** FSM with `FakeDecisionAdapter` and a `FakeAgentRunner` that applies predefined patches to the worktree. They cover every transition: rollback, escalation, integrity, skips, human edits, resume, baseline. Parsers with real files: `SPEC.md` and `.feature` in the article's format, and invalid cases (duplicate IDs, Given/When/Then in an FR, untagged scenarios).
2. **StackAdapter integration:** fixture projects with one case per row of the Red Gate classification table (§6.4) and per `FailureKind`. The probes made while writing this version are the starting point: missing export, missing module, syntax error and assertion in vitest; undefined step, `Cannot find module` from a dynamic import, assertion, and a static import that prevents startup in cucumber.
3. **Detector integration:** fixtures with a cross-file duplication, a complex function, an unused export, a magic number and a stale JSDoc, and their refactored versions, to check detection, acceptance criteria and the refactored-tests guarantee.
4. **Golden runs (with network):** 2–3 small projects (e.g. the article's URL shortener, in TypeScript). Metrics: whether it reaches `DONE`, retries, interventions, cost, human–Jev agreement. They detect prompt regressions and feed calibration.

Rules taken from what Buddy learned through defects that reached production *(Buddy)*:

- **Test the wiring, not just the policy.** A correct sandbox that is never installed protects nothing. `runAgent` receives an injectable `openSession`, and a test checks that the returned session has the `beforeToolCall` hook installed and that it blocks. In Buddy, the original defect of its permission gate was not in the policy but in the hook not being installed, and a test of the policy alone would not have caught it.
- **`FakeSession` with the SDK's real event shapes** (`message_end` with `stopReason`, `tool_execution_start/end`, `agent_end`), including provider-error and empty-response cases.
- **Tests cannot reach the network or the real SDK by accident.** The real `runner` throws if it detects the test environment (environment variable), like Buddy's `spawnReflectChild`: a silent no-op spent months launching real processes on every BDD run.
- **SDK compatibility test** that checks the shapes `oid` uses (`createAgentSession`, `SessionManager.create`, `agent.beforeToolCall`/`afterToolCall`, events), so that an upgrade breaks the suite and not the run.
- **`agentDir` isolation test:** every call to `createAgentSession` passes `oid`'s `agentDir`.
- **`TOOL_PATH_ARGS` test:** fails if a registered tool has an undeclared path-shaped parameter.

**Dogfooding.** From M2, new `oid` features are developed with `oid`, and it is used on Buddy. When working on its own repository, `oid` runs from an installed version (not from the code it is modifying); the isolated worktree (§6.11) guarantees that a run does not alter the tool driving it. Every real run feeds Jev's thresholds, the detectors' thresholds and the prompts.

---

## 20. Risks and pending verifications

| Risk | Mitigation |
|:--|:--|
| The Pi SDK API changes often | Pinned version; all contact in `agents/runner.ts`. |
| Jev is a recent service | Integrated in Pi and served by several providers; pinned model; conservative policy on outages; local alternative with `llama-cpp-classify`. |
| Wrong Red Gate classification | Deterministic layer first; logging; escalation on repeated ambiguity; agreement metric. |
| Over-implementation by the coder-agent | Informational DoD, optional coverage, human review of the final branch. |
| Secrets leaking to the model provider | `secret_globs` blocked for reading for every agent. |
| Cost of installing `node_modules` in every worktree | Link to the main checkout while dependencies do not change; one worktree per run, not per FR (§9.2). |
| Projects with a different structure | Configurable via `paths`; `oid init` detects and proposes. |
| The user's global Pi configuration leaks into sessions | Own `agentDir` and `systemPromptOverride`; isolation test. |
| A provider error passes for success | `assertProductiveResponse` after every `prompt` (§7.5). |
| A tool is registered but never offered | One array for `tools` and `customTools` (§7.3). |
| Existing repositories with debt (types, lint, traceability, refactor findings) | Frozen baseline (§6.14); existing debt is `oid tidy`'s job. |
| A static import of something that does not exist yet prevents cucumber from starting | Loadable-steps rule, checked before running (§9.2). |
| Detector false positives (especially `knip` with unconventional entries) | Jev triage, baseline, `refactor.entry`, and accepted debt after two rejections (§14.1). |
| Refactor adds cost to every cycle | Micro only launches an agent if there are findings after triage; detectors and triage are cheap. |
| A test refactor stops testing something | Guarantee against the code from before the FR (§6.8) and assertion counting in `oid tidy` (§14.1). |
| Over-engineering in the name of refactoring | Closed list, metrics that cannot get worse and the two-references rule (§6.8). |
| `InteractiveMode` terminates the process on exit | Runs in a child process (§13). |
| The terminal interface eats MVP development time | Built on `pi-tui` and Pi's chat components; the logic lives in the `EventBus`, the interface only draws it. |

Technical verifications before implementing:

- [x] Pi SDK: blocking mechanism. Resolved: chained `session.agent.beforeToolCall`, returning `{ block: true, reason }`; `afterToolCall` can rewrite `ctx.result`. Learned on `^0.84`, still the code Buddy runs on 1.0.1 (`backends/permissions.ts`, heading guard FR-GUARD-01c). `pi-permission-gate` returns the same shape from the extension `tool_call` event (Pi 0.79.10), which is the design-phase path.
- [x] `thinkingLevel` levels in Pi: `off`, `minimal`, `low`, `medium`, `high` (the first two used in Buddy).
- [x] Pi SDK: launching interactive mode with a custom profile. Resolved: `InteractiveMode` is exported and takes an `AgentSessionRuntime` (`createAgentSessionRuntime` + `createAgentSessionServices`, with `agentDir` and resource loader options). It ends with `process.exit`, hence the child process (§13).
- [x] Terminal components: `@earendil-works/pi-tui` is a standalone framework (`TuiMainScreen`/`TuiAltScreen`, components, overlays), and `pi-coding-agent` exports its chat components and its theme.
- [x] Pi version: API inventory checked on the `v1.0.0` tag: `agent.beforeToolCall`/`afterToolCall`, `DefaultResourceLoader` with `systemPromptOverride`, `excludeTools`, `SessionManager.create`/`inMemory`, `session.abort()`, reasoning levels, `tool_execution_*` events, `createAgentSessionRuntime`, `InteractiveMode`, `ModelRuntime.classify()`. The pin is **1.0.3**.
- [x] User Pi configuration does not leak into a session that passes `agentDir`, and `tools`/`customTools` come from one array. Buddy 1.0.1: NFR-SEC-19/20, `backends/session-boot.ts`.
- [ ] Pi SDK on the pinned 1.0.3: a bad API key surfaces as `stopReason: "error"` from `prompt()` and `classify()` (not a rejected promise), and `SessionManager.create(cwd, dir)` plus `session.abort()` still match Buddy's 1.0.1 usage. Spike S1. The 1.0.1 usage itself is not in doubt.
- [ ] The `score` scale each classification provider returns (Jev via OpenRouter, `llama-cpp-classify`), for the normalisation in §8.1.
- [ ] Availability and price of `typesafe/jev-1.13` on OpenRouter versus `jev-latest` on TypeSafe direct.
- [x] cucumber-js 13 reports: only the structured `message` format (no `json` or `junit`). Step states and exceptions verified (§9.2).
- [x] vitest 3 JSON report: shape of load errors and per-test failures (§6.4).
- [x] A static import of a missing module in a step file prevents cucumber-js from starting, with no report (§9.2).
- [ ] `vitest list`: id format, to verify the `report`'s `test`.
- [x] `knip` and `jscpd` on Buddy: entry configuration (worker, Svelte frontend, scripts) and false-positive rate. Spike S4, ADR-027.
- [x] Cost of `tsc --noEmit` in `CODE_GREEN` on a project the size of Buddy; if high, incremental mode or `tsc --build`. About 7 s on Buddy: acceptable without incremental mode (S4, ADR-027).
- [ ] Gherkin with `# language: es` in cucumber-js, if `artifact_language` is `es`.

---

## 21. Roadmap

| Milestone | Content |
|:--|:--|
| **M0** | FSM with fakes, parsers, traceability, `artifacts/progress.ts` + `oid progress` + `oid check` + `oid init --import-progress`, baseline, TypeScript StackAdapter (Red Gate classification, loadable steps, compiler-API analysis), detectors and metrics, git (worktree, checkpoints, squash, integrity), JSONL events. No LLM and no Jev. `oid progress`, `oid check` and `oid metrics` are already useful on their own at this milestone, on Buddy too. |
| **M1** | AgentRunner with the Pi SDK, single toolset, per-state profiles, sandbox (`beforeToolCall` + containment), `edit` hints, productive response, `report`, `request_dependency`, reuse catalogue. Micro refactor. Terminal interface: progress mode, decision cards and feature review, no-TTY output. Full `new-feature` cycle with one FR. |
| **M2** | `PiClassifierAdapter` with the full catalogue (finding triage included), escalation, meso refactor with the test guarantee, full `WAITING_INPUT` with "Talk it through", notifications, `oid watch`. Golden runs. **Dogfooding starts**: `oid` on itself and on Buddy. |
| **M3** | `oid spec` / `oid spec --fr` (Phase 0 with `InteractiveMode` in a child process, sandbox as an extension and `/check`) and `oid tidy`. **Closes the MVP.** |
| **M4** | Web dashboard (§12.5). |
| **M5** | `fix-bug`. |
| **M6** | `new-project` + scaffolding. Python stack (§9.4). |
| **M7** | Calibrate a local model with `llama-cpp-classify` against Jev, using the `oid decisions` history. |

Until M3, FRs can be written by hand in `SPEC.md` following the format of §4.2.

---

## 22. Changes

### v3.11 — spike S1 reduced to the 1.0.3 delta

| Area | v3.10 | v3.11 |
|:--|:--|:--|
| Buddy's Pi version, as cited for current behaviour | 0.84, where the patterns were learned | Lockfile resolves `pi-coding-agent` to 1.0.1. Isolation, `beforeToolCall`, the single tool array and `session.abort()` are in that tree |
| Spike S1 | A full session experiment: block reason, custom tool, odd setting in `~/.pi/agent`, bad key, abort, transcript | Only the bad-key `stopReason` and whether `SessionManager.create(cwd, dir)` and `session.abort()` still match the 1.0.1 usage |

### v3.10 — pin and layout

| Area | v3.9 | v3.10 |
|:--|:--|:--|
| Pi pin | 1.0.0, with the API inventory checked on that tag | 1.0.3, the current stable of the same line. The tag check stays; behaviour on 1.0.3 is spike S1 |
| Node | ≥ 22 | ≥ 22.19, the `engines` field of `pi-coding-agent` 1.0.3 |
| Repository layout (§18) | `bin/oid.ts` plus `test/unit` and `test/e2e` | `src/cli.ts` compiled to `dist/cli.js`; `tests/unit/` and `features/`, matching §4.1 |

### v3.9 — English translation

| Area | v3.8 | v3.9 |
|:--|:--|:--|
| Language of this document | Spanish, the only document in the repository not in English | English, like the rest of the repository. Content unchanged; example data (scenario names, project names, the TUI mock) translated too |

### v3.8 — repository bootstrap

| Area | v3.7 | v3.8 |
|:--|:--|:--|
| Design artifacts | Only this document | `SPEC.md`, `DOMAIN.md` and `DECISIONS.md` in the repository, in the article's format; this document becomes `docs/design.md` |
| Commands | Checks only inside the FSM | `oid verify red/green/integrity` and `oid metrics --changed` as standalone commands, for use during bootstrap |
| Acceptance criteria in `SPEC.md` | Lines starting with Given/When/Then | Only Gherkin-style sequences; the previous rule gave false positives on ordinary sentences |

### v3.7 — name

| Area | v3.6 | v3.7 |
|:--|:--|:--|
| Command | `oi` | `oid` (Outside-In Development); throughout the document, including earlier versions of this log |
| npm package | Undefined | `outside-in-dev` |
| Environment variables, directories | `OI_*`, `~/.config/oi`, `.oi-worktrees` | `OID_*`, `~/.config/oid`, `.oid-worktrees` |

### v3.6 — detector-guided refactor and TypeScript in the MVP

| Area | v3.5 | v3.6 |
|:--|:--|:--|
| Refactor | Optional after each scenario, if Jev gave > 0.70 to a vague question; source code only | Three scales guided by deterministic detectors: micro after each green, meso at the end of the FR (tests, steps and documentation included) and `oid tidy` over the whole project (§6.8, §14.1) |
| Jev's role in refactoring | Deciding whether to refactor | Filtering detector false positives |
| Refactor acceptance | Tests green | Tests green, findings resolved, none new, metrics not worse, two-references rule, closed list |
| Refactored tests | Tests were not refactored | Guarantee against the code from before the FR; assertion counting in `oid tidy` |
| Duplication from context isolation | Not considered | Reuse catalogue in the coder-agent's context (§7.8) |
| Code drift | Invisible | Health metrics per FR, trend in the TUI and the report, `oid tidy` triggers |
| MVP stack | Python | TypeScript (vitest, cucumber-js, `tsc`), for dogfooding and for use on Buddy; Python moves to M6 |
| Red Gate | pytest signals | vitest and cucumber-js signals verified in real probes; names resolved with the compiler API |
| Runner reports | JUnit XML | Cucumber Messages (NDJSON) and vitest JSON; cucumber-js 13 no longer ships `json` or `junit` |
| BDD steps | pytest-bdd bindings | Loadable-steps rule: whatever does not exist yet is imported dynamically |
| Types | Only in the quality gate | Also in `CODE_GREEN`, limited to source code |
| Projects with another progress schema | Not considered | `oid init --import-progress` (Buddy) |

### v3.5 — Pi 1.0.0 and Jev through Pi

| Area | v3.4 | v3.5 |
|:--|:--|:--|
| Pi version | Unpinned (Buddy uses 0.84) | 1.0.0, with the spec's APIs checked on the tag |
| Access to Jev | `@typesafe-ai/sdk` SDK, own client | Pi's `ModelRuntime.classify()`: same credentials, cost and error handling as the agents |
| Questions | `noul` without criteria | `bool` with a criterion for `true` and `false` (Jev receives it as `noul`) |
| Local model | Adapter to be written | Pi's `llama-cpp-classify`; only calibration is missing |
| Default model | `jev-1.13` (TypeSafe direct) | `typesafe/jev-1.13` via OpenRouter, because it is versioned |

### v3.4 — terminal interface in the MVP, web later

| Area | v3.3 | v3.4 |
|:--|:--|:--|
| MVP interface | Web dashboard + readline CLI | Modern terminal interface with `pi-tui`: progress mode and conversation mode |
| Web dashboard | In the MVP (M3) | Post-MVP (M4), as another view over `events.jsonl` |
| Human decisions | Card on the web or readline prompt | Cards in the terminal, feature review with highlighting and `$EDITOR`, and "Talk it through" for problems that deserve a conversation |
| Phase 0 | "Launch Pi's TUI", unverified | `InteractiveMode` with its own `AgentSessionRuntime`, in a child process; sandbox as an extension; `/check` |
| Following a run | `oid dashboard` | `oid watch` from another terminal |
| Roadmap | MVP with no clear boundary | MVP = M0–M3 |

### v3.3 — the article as the reference for the artifacts

Buddy started before the methodology was settled, and part of what the article says was learned from its mistakes. v3.2 took its artifacts as the model; v3.3 goes back to the article for everything that is methodology and keeps from Buddy only the engineering (Pi SDK, testing, robustness).

| Area | v3.2 | v3.3 |
|:--|:--|:--|
| `SPEC.md` | Parser tolerant of Buddy's format (tables, bold, suffixes, ✓ states) | The article's format: `### FR-XXX-NN: Title` and `### NFR-NN: Title` |
| Given/When/Then in `SPEC.md` | Warning, and a hint for the bdd-agent | Blocking for target FRs, as the article requires |
| Traceability | ID in the `Feature` title accepted | Only (effective) `@FR-xxx` tags |
| `progress.json` | `progress.ts` schema (`spec_review`…`bdd_green`, `unit_tests`, `blocked`, `deferred`, `note`) | The article's schema: `cycle_step` with the cycle's steps, `status` `pending`/`in_progress`/`done`, no extra fields |
| Transitions | Forward only | Those of the article's two loops (§4.4) |
| Tests per scenario | `unit_tests` field | In `session.json`; an `oid` rule, not a schema one |
| Skips | `blocked`/`deferred` with a note | FR `in_progress` or back to `pending`; the reason in `events.jsonl` |
| `oid progress` | Replica of `progress.ts` | Its own interface over the article's schema, with `step` instead of `advance` |

### v3.2 — contrast with Buddy

| Area | v3.1 | v3.2 |
|:--|:--|:--|
| `progress.json` | Own schema (`done_with_skips`, `skipped`, fine-grained `cycle_step`, nodeids) | The schema and rules of `scripts/progress.ts`; coarse-grained `cycle_step` mapped to the FSM; nodeids in `session.json` |
| Progress tool | Only the FSM wrote | `oid progress` with `progress.ts`'s interface + `oid check`; the same module for both |
| `SPEC.md` | Strict format with `### FR-X:` | Parser by IDs (suffixes like `06b`, NFRs with an area), title from heading, bold or table, ✓/rejected/deferred states |
| Given/When/Then in `SPEC.md` | Blocking | Warning, and passed to the bdd-agent as a hint |
| Traceability | Exactly one tag per scenario | Effective tags (inherited from the `Feature`), ID in the title accepted in existing files, frozen debt |
| Baseline | Everything green or `WAITING_INPUT` | Pre-existing lint, types and traceability frozen; only what is new counts |
| Skip scenario | FR `done_with_skips` | FR `blocked` with a note; `done` still requires everything green |
| `integration_step` | Always possible | Only if the scenario already has ≥1 unit test |
| Sandbox blocking | `pi.on("tool_call")`, pending verification | Chained `session.agent.beforeToolCall` (verified) |
| Tools | Two lists | One array for `tools` and `customTools` |
| Paths | `normalizeInsideRoot` | `TOOL_PATH_ARGS` with a guard test + containment with symlinks on both sides; `grep`/`find`/`ls` without a path blocked |
| Pi isolation | Implicit | Own `agentDir` + `systemPromptOverride`, with a test |
| Provider errors | Not considered | `assertProductiveResponse`; infrastructure retries that do not consume methodology attempts |
| Failed `edit` | Attempt lost | Deterministic hint in `afterToolCall` |
| Transcripts | `SessionManager.inMemory()` | `SessionManager.create` in the run's folder, for auditing |
| Cost | Generic | From `message_end`, checked before every billable call |
| Test quality | `test_is_meaningful` | + `asserts_only_absence` (warning) + ban on reading source code as text |
| Prompts | Artifact language | Always in English with no examples in other languages; test data in the user's language |
| Commits | `feat(FR-X): title` | Configurable template; by default `feat(scope): FR-X title` |
| Testing `oid` | Three levels | + wiring tests, faithful `FakeSession`, guard against the real SDK, SDK compatibility, `agentDir` isolation |

### v3.1

| Area | v3 | v3.1 |
|:--|:--|:--|
| Red Gate | Import errors at collection = "not a Red" | Deterministic `missing_implementation` when what is missing belongs to the project (the most common Red in TDD) |
| Regression | Only the current scenario was checked | Already-green scenarios and the full unit suite on every run; prior `BASELINE` |
| pytest-bdd | No convention | One `@scenario` per scenario; selection by the nodeid returned in `report` |
| Permissions | Per role | Per state (features vs. steps), secrets blocked |
| Dependencies | No mechanism | `request_dependency` with an `ask`/`allowlist`/`auto` policy |
| Quality gate | No failure flow | Deterministic autofix + targeted `QUALITY_FIX` + escalation to the human |
| Test quality | Not assessed | `test_is_meaningful` in the same Red Gate call |
| Features | Review per FR | `upfront` by default: one initial review and unattended execution |
| Git | Branch per FR, commit on the base | Isolated worktree, one branch per run with one commit per FR; the merge is the human's decision |
| Human edits | Undefined | Detection, `human edit` checkpoint and re-validation |
| Retries | Same model | `thinkingLevel` escalation and `models.strong` on the last attempt |
| Skips | No semantics | `skipped`, `done_with_skips`, skip FR |
| Resume | Mentioned | Re-execution invariant, lock, rollback on resume |
| Phase 0 | Chat to be built | Reuses Pi's interactive TUI with the spec-agent's profile |
| Unattended | — | `notify_command` and final report |
| Inconsistencies fixed | spec-agent without `write`; incomplete `cycle_step` enum; conservative `setup_error` threshold missing from the catalogue | Fixed |
