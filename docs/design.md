# Technical design: Outside-In Development CLI (`oid`)

> **What this document is.** The design in force: how oid works today, and the principles and plans for what is not built yet. Every section says which is which: what is not marked is built; **Planned (FR-xx)** has a requirement in `SPEC.md`; **Direction** is intent with no requirement yet. A change that alters a decision goes with its ADR, and git keeps the earlier versions (ADR-054). Known differences between this document and the code, still to be resolved, are listed in §20.3.
> **Methodology reference.** [Outside-In Development: Spec → BDD → TDD for AI Coding Agents](https://ai.juanjeojeda.com/outside-in-development). The article is the starting reference for the methodology and its artifacts; a deviation is recorded as an ADR (ADR-054). The Buddy project is an engineering reference: how to use the Pi SDK, and the testing and robustness lessons it learned in production (ADR-011).

`oid` (from *Outside-In Development*) is a command-line tool that enforces the Outside-In methodology (Spec → BDD → TDD) on coding agents. It is not an assistant that "tries to follow" the methodology, and it does not try to control its agents either: it designs the conditions under which they work. A state machine written in TypeScript owns the cycle: it decides which step comes next and judges each step's result. Inside each step, ephemeral agents built on the Pi SDK write specifications, tests and code, organising the how themselves; and a decision model (Jev, through Pi's classifier API) will answer the semantic micro-decisions that deterministic code cannot make.

The command is `oid` and the npm package `outside-in-dev` (ADR-023). The target project's files keep descriptive names: `.outside-in.json` and `.outside-in/`.

---

## 1. Motivation

Coding agents fail in four predictable ways: they build the wrong thing, they do not verify their work, they over-engineer, and they do not know when to stop. The Outside-In methodology attacks the common cause (the lack of a verifiable contract), but when it is applied only through instructions in an `AGENTS.md`, it depends on the model's discipline, and discipline degrades:

1. **Test cheating.** An agent with access to tests and implementation at the same time tends to fit the tests to the code, or to relax assertions until they pass.
2. **Context inflation and methodological drift.** In long conversations the model forgets instructions, mixes phases and drags along thousands of irrelevant tokens.
3. **The false deterministic/generative dichotomy.** An `if` cannot tell whether an error trace is a business failure or a broken import; a general reasoning model is slow and expensive for a yes-or-no question.

**A rule only governs what it can reach.** Several of Buddy's defects were already forbidden in its prompts: the instruction did not fail, it simply did not apply, because the failure happened without anyone disobeying (a status nobody updated, a missing call, an operation that "succeeded" without doing anything). When a failure needs no disobedience, the protection has to live in the environment, not in another instruction. And an agent organises itself around whatever goal, context and limits it is given: the same agent behaves differently when what it sees changes. `oid` takes both ideas to the whole cycle (§3).

## 2. Goals and non-goals

### Goals

- **Shape the conditions, not the steps.** The methodology holds because of the environment the agents work in (what they see, what they can reach, what counts as done), not because of how many rules they are told. The model cannot skip the Red because it is not the one deciding the transition.
- **Context isolation.** Each agent receives only what it needs for its immediate task and dies when it finishes.
- **Token efficiency.** Everything deterministic is done by Node.js, git, parsers and the stack's tools; micro-decisions go to a decision model; generative models only write specs, tests and code.
- **Autonomy after human review.** Once the design artifacts are defined and the features reviewed, the cycle completes without intervention unless it asks.
- **Contain code drift.** Duplication, complexity, dead code, hard-coded values and stale documentation are detected and cleaned as part of the cycle, at three scales (§6.8).
- **Used on real projects early.** TypeScript first, so oid can be used on itself and on Buddy (ADR-019).
- **Observability and interaction in the terminal.** A compact progress view while the cycle runs on its own, which becomes a conversation when a person is needed. A web view comes later, over the same events.

### Non-goals

The MVP's boundaries are in `SPEC.md` ("Not in scope"): no `fix-bug` or `new-project` workflow, no Python, no web dashboard, no CI or multi-user execution, no automatic merge, no calibration of a local decision model, and no replacing human judgement in the design phase, which is always interactive. §14 keeps the direction for the ones that come later.

---

## 3. Design principles

These hold for what is built and for everything still to come.

### 3.1. Influence, not control (ADR-055)

An agent is a complex system: it organises itself around its goal and its context, and a rule only governs what it reaches. oid fixes the **what** (the scenario, the test, the contract) and the **evidence** (what counts as done), and influences the rest.

**Invariants, held strictly:** the contract approved from outside oid (the specification and the feature files, approved scenarios and their assertions): the person who uses oid approves it, however they answer, even through another agent they drive; oid never approves it by itself; the evidence (a real Red and a real Green, and checks that tell the truth); safety (secrets, the user's working copy, git). Every other constraint has to justify itself.

**The sequence of the cycle** (scenario by scenario, a Red before each Green) is a constraint on the how, kept deliberately: writing the test from the specification before the code shapes the design and keeps tests from being fitted to the code. Where it blocks legitimate work, because a Red is impossible or artificial, the legal path is evidence by mutation (ADR-056), not another return.

oid acts on four parameters:

| Parameter | In oid |
|:--|:--|
| **Objective** | The FR and the scenario, what and why; and the goal of the whole system (code that is easier to read, change and trust), not only the local task. A local goal alone ("make this finding go away") invites hiding the finding. |
| **Focus of attention** | What the agent sees: the context of its task (§7.8), examples chosen by relevance, the reuse and step catalogues, the project's conventions with their reasons, and the text of every rejection. |
| **Boundaries** | What it can reach: paths and tools per state (§7.2), the shell only for the coding agent, cost, turns, time and retries (§11). Stated to the agent exactly as they are applied. |
| **Constraints** | The rules of the task: the gates (§6), the shape of the tools (few modes, opinionated defaults), the report (§7.6). |

A constraint is kept only if it passes six questions:

1. Does it serve the goal of the system, not a theory or a framework?
2. Does it leave a legal path to the goal? When it does not, the agent finds its own, and it is worse: a fabricated Red, code moved to force one, a finding hidden behind a constant named after its value.
3. Does it remove a decision the agent should not make, not its thinking?
4. Can it live in the environment (a boundary, a tool, a message) rather than in a rule of the prompt?
5. Does it restrain without forcing one single way of doing the task?
6. Is it measured, and changed when the measurement says so (§19)?

Feedback and reasons are structure, not style: every rejection carries what failed, the evidence and the next action in a typed shape (FR-AGENT-10), and every rule addressed to an agent carries its reason. A rule without one is missing its reason, belongs in the environment, or goes.

### 3.2. Principles

1. **The orchestrator owns the cycle.** The state machine decides the next step and judges each result; agents do single tasks and hand back (ADR-001).
2. **Deterministic first, decision model second, generative model last.** If a parser, an exit code, a `git diff`, the compiler or a stack tool can settle it, no model is consulted (NFR-01).
3. **Ephemeral agents with boundaries per state.** Each task gets a new Pi session with a clean context (the transcript is kept for auditing), limited tools, and read/write access set by the **state**, not only the role.
4. **Only the orchestrator verifies.** Only the agents that write code have a shell, contained in the run's worktree (ADR-029). What an agent runs is feedback for its attempt; Red, Green and moving the cycle on are decided by the orchestrator from its own runs, so every verification is empirical, never self-reported (NFR-02). Git and dependency management stay with the orchestrator.
5. **Empirical confirmation of the Red.** A test counts as Red only if the runner executes it and it fails for the right reason: the behaviour does not exist yet or is wrong. "Undefined", "pending" or a broken test are not Red.
6. **Every gate has a legal way out.** When a gate refuses, the agent gets another attempt, a legal move (a return to a Red, a guard, a revise), or a question to the human; never a dead end it has to work around.
7. **Every rejection says what to do next.** What failed, the evidence (the failing assertion, the undefined step) and the next action. A bare "fail" brings a blind retry: the agent repeats the same mistake. Tool output changes an agent's behaviour more reliably than a rule in its prompt. `Rejection` (`src/artifacts/rejection.ts`) holds `failed`, `evidence` and `next`; it is a branded type that only `rejection()` makes, and that refuses an empty part, so a rejection written by hand does not compile and none can leave the next action out. One function, `renderRejection()`, prints it the same way on every surface (the gates of `oid run`, `oid verify`, `oid try`, the sandbox and containment denials): what failed on the first line, then `Evidence:`, then `Next:`. The next attempt gets it whole; only the one-line plain output cuts the evidence, never the first line or the next action (FR-AGENT-10).
8. **Every check tells the truth.** The exit code and the report of each tool must agree; a run in which no test ran is a failure, not a pass. A detector with false positives invites a cosmetic fix, so its precision is a requirement.
9. **Few rules, each with its reason; character over limits.** oid owns the whole prompt of its agents (ADR-008), so the number of its instructions is a design value, counted and kept low. A trait states a value and its why; a limit the environment already enforces (the sandbox, integrity) is not repeated in the prompt; a limit it cannot enforce goes next to the step where it applies. Context (examples, catalogues, the design passages of an FR) informs without competing as rules do.
10. **Git as the rollback mechanism.** A failed attempt returns to the last checkpoint. Reverting costs no tokens.
11. **Execution isolated from the user's working copy.** oid works in its own git worktree, so a rollback never deletes anything of the user's (NFR-04).
12. **The methodology's artifacts live in the repo; execution state does not.** `SPEC.md`, feature files and `progress.json` are versioned; `.outside-in/` is ignored by git.
13. **A single feedback channel at a time.** In the MVP, the terminal. If a second channel is added, whoever answers first wins.
14. **The artifacts also work without oid.** `SPEC.md`, the feature files and `progress.json` follow the article's formats (with the extensions the ADRs record), and `oid progress`, `oid check` and `oid verify` expose the same rules to any human or agent. A project can advance some features with `oid run` and others with an agent guided by an `AGENTS.md`.
15. **"It went well" is not evidence.** A session ending, `prompt()` resolving or an agent reporting success proves nothing; the proof is the artifact: the test that ran, the diff, the exit code (NFR-03).
16. **Every gate judges only what the run adds.** Existing debt is recorded at the start and does not block; new debt does (ADR-021).

---

## 4. Target project artifacts

### 4.1. Inventory

| Artifact | Location (default) | Content | Written by |
|:--|:--|:--|:--|
| `SPEC.md` | root | FRs and NFRs with unique IDs. No acceptance criteria. | the human; the spec-agent in Phase 0 (Planned, FR-SPEC) |
| `DOMAIN.md` | root | Glossary, real examples, formats, observed behaviour of external systems. Optional. | same |
| `DECISIONS.md` | root | ADRs: context, options, decision, consequences. | same |
| Feature files | `features/` | Gherkin scenarios with traceability tags. | feature-writing agent (`FEATURE_WRITE`) + human review |
| Step definitions | `features/steps/`, `features/support/` | TypeScript steps with real assertions. | step-writing agent (`BDD_RED`) |
| Unit tests | `tests/unit/**/*.test.ts` | vitest tests. | test-writing agent (`TDD_RED`) |
| Code | `src/` | Minimal implementation. | coding agent (`CODE_GREEN`, `REFACTOR`) |
| Conventions | `paths.conventions` | The project's own rules for features, steps, tests and code (ADR-051). | the people of the project, never oid |
| Documentation | `README.md`, `docs/` | Project documentation. | the coding agent, in a refactor |
| Dependencies | `package.json`, lockfile | Project packages. | **only the orchestrator** (`request_dependency`, §7.7) |
| `progress.json` | `paths.progress` | Methodology state per FR and scenario (§4.4). | **only the orchestrator** and `oid progress` |

Paths are configurable (`paths`, §16); `oid init` detects the project's structure and proposes it. The **formats** are the article's (ADR-011). Design documents, feature files, test names, code and comments are in English; only test data may be in the end user's language (ADR-053).

### 4.2. `SPEC.md` format

Each requirement is a heading with a unique ID, a short title, and a description of **what** it does and **why** it matters. No acceptance criteria: those live only in the feature files.

```markdown
### FR-SHORTEN-01: Shorten a URL

Given a valid URL, the system generates a unique short code
and returns the shortened URL. ...

### NFR-01: Idempotency

Shortening the same URL twice must return the same short code. ...
```

Parser rules:

- FR: `^### (FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?): (.+)$` (an optional lowercase suffix, as in `FR-PERM-06b`, ADR-026).
- NFR: `^### (NFR-\d{2,3}): (.+)$`.
- The body of each requirement is the text up to the next heading of level ≤ 3.
- Level-2 section titles are not interpreted, so the human can arrange the sections freely.

Validations (`oid check`, and `SPEC_CHECK` for the target FRs of a run):

- Each ID is unique; title and body are not empty.
- **No acceptance criteria in the body**: a Gherkin-style sequence (a line starting with `Given`, plain, as a bullet or in bold, followed later by one starting with `Then`) or a `Scenario:` line. An ordinary sentence that starts with "When" does not count. The spec defines intent; Gherkin, verifiable behaviour.

### 4.3. Traceability

Four pieces linked by FR-ID: `SPEC.md` (IDs as headings), feature files (`@FR-xxx` tags), tests, and `progress.json`. `oid check` and the quality gate check them with the Gherkin parser and the `SPEC.md` parser:

- Every scenario has at least one `@FR-…` tag that exists in `SPEC.md`. **Effective tags** count (the scenario's plus those inherited from the `Feature` and `Rule`). Feature files written by oid have one file per FR, with the tag on the `Feature`.
- `@NFR-…` tags are optional, but must exist if present.
- `progress.json` agrees with the other artifacts: a focus on a feature in progress, a `done` feature with every scenario in `pass` and every tagged scenario recorded, a started feature with feature files, and every recorded scenario present in a feature file.
- Behaviour without a scenario, or a scenario without an FR, is a violation.

Violations that existed before a run are frozen debt (§6.14).

### 4.4. `progress.json`

A methodology artifact, versioned. It answers "what is built and what is left?" for any human or agent, with or without oid. It is **schema-validated JSON**, not Markdown, so that it cannot degrade into notes; unknown fields are refused (FR-PROG-07). It is written only by the orchestrator and `oid progress`. Whatever else oid needs lives in `.outside-in/` (ADR-012).

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
| `cycle_step` | `select`, `bdd_red`, `tdd_red`, `tdd_green`, `refactor`, `quality_gate` |
| `scenarios[].bdd` | `pending`, `fail`, `pass` |

`scenarios` and `cycle_step` appear only on started features; `cycle_step` disappears on `done`. A scenario accepted as a guard (ADR-049) carries its reason.

**Transitions.** They follow the article's two loops:

```
select → bdd_red → tdd_red → tdd_green → refactor ─┬─→ tdd_red        (inner loop: scenario still red)
                                                    ├─→ bdd_red        (outer loop: next scenario)
                                                    └─→ quality_gate   (all scenarios green)
```

From `tdd_green` the same three moves are allowed directly, when there is no refactor. Going back to a Red is always allowed: `tdd_red → bdd_red`, and from `quality_gate` only to `bdd_red` or `tdd_red` (a gap seen at the gate becomes a new Red). Going back from a later step records a **return** (ADR-038, ADR-044). `bdd_red → quality_gate` exists only after `oid progress revise`, when no code is needed (ADR-041). Anything else is rejected.

**Moving to `done`.** `oid progress done` checks what the files can prove: at least one scenario, every scenario in `pass`, every scenario tagged with the feature recorded, and the evidence of a green that ran them with nothing changed since (ADR-030). In `oid run`, the rest follows from the control flow: `FR_COMMIT` comes only after `QUALITY_GATE`, and every scenario but an accepted guard has at least one unit test (§6.6).

**Revise and reopen.** A changed requirement is `oid progress revise` (the human's); a review or a bug on a `done` feature whose passing scenarios still describe it is `oid progress reopen` (ADR-039).

**Order.** The order of `features` is the default execution order. New FRs are appended at the end; the human can reorder.

### 4.5. The `.outside-in/` directory

Ignored by git, in the main copy. Local state only; nothing in it is a methodology artifact.

```
.outside-in/
├── lock                       # PID of the running `oid run`
├── session.json               # what a stopped run needs to resume (§17)
├── runs/<runId>/
│   ├── events.jsonl           # every event of the run (§12.1)
│   ├── sessions/              # transcript of each agent session
│   └── tests/                 # runner reports of the baseline
├── verify.lock                # PID of the running `oid verify`
├── verify/                    # the latest runner reports of `oid verify` and `oid try`
├── checkpoints/<FR>.json      # a feature's last passing verification, with copies of its files (ADR-030)
│   ├── <FR>.red.json          #   the scenario Red that a returned step is judged against (ADR-038)
│   ├── <FR>.return.json       #   a return in progress (ADR-038, ADR-044)
│   └── <FR>.revise.json       #   the state at the last revise (ADR-041)
├── checkpoint.json            # a verification with no feature
├── red-observation.json       # a failure waiting for `--decide` (ADR-017)
├── baseline.json              # the findings recorded by `oid metrics --baseline`
└── metrics.jsonl              # code-health history (§6.8)
```

The exact paths are constants in `src/artifacts/` and `src/orchestrator/`. In the bootstrap, the Claude Code hooks also write `overrides.ndjson` (ADR-045).

---

## 5. Architecture

```
                     ┌──────────────────────────────┐
                     │ CLI: oid run / resume / …    │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │   Orchestrator (states)      │
                     │ gates · retries · questions  │
                     └──┬───────┬───────┬───────┬───┘
                        │       │       │       │
          ┌─────────────▼┐ ┌────▼────┐ ┌▼───────┐ ┌▼─────────────┐
          │ Decisions    │ │ Agents  │ │ Stack  │ │ Artifacts    │
          │ (Jev,        │ │ (Pi SDK)│ │ (vitest│ │ (SPEC,       │
          │  planned)    │ │         │ │  cucum.│ │  Gherkin,    │
          └──────────────┘ └─────────┘ │  tsc)  │ │  progress)   │
                                       └────────┘ └──────────────┘
                        │       │       │       │
                     ┌──▼───────▼───────▼───────▼───┐
                     │ Git (worktree, checkpoints,  │
                     │ integrity) · session         │
                     └──────────────┬───────────────┘
                     ┌──────────────▼───────────────┐
                     │ Event bus → events.jsonl,    │
                     │ terminal                     │
                     └──────────────────────────────┘
```

| Component | Nature | Responsibility |
|:--|:--|:--|
| Orchestrator | Deterministic | States, transitions, gates, retries, questions, budget. |
| Artifacts | Deterministic | Parse `SPEC.md` and Gherkin, traceability, `progress.json`, checkpoints, integrity, detectors and metrics. |
| Stack | Deterministic | Runners and their structured reports, autofix, type check, dependencies, reuse catalogue (compiler API). |
| Git | Deterministic | Worktree, branches, checkpoints, rollback, squash. |
| Decisions | Probabilistic, ~200 ms | **Planned (FR-DEC).** Classify failures, judge test quality, effort, spec, triage findings. |
| Agents | Generative | Ephemeral Pi sessions, sandbox, context, completion report. |
| Event bus | Deterministic | Event log, terminal output, questions to the human. |

**Principles of the boundaries.** All contact with the Pi SDK is in `src/agents/` (one place to adapt when Pi changes, ADR-003). Everything specific to a stack (runners, report formats, compiler analysis) stays behind one seam, so that adding Python does not touch the orchestrator; today that seam is the `Runners` type in `src/artifacts/verify-runner.ts` and the analysis modules of `src/artifacts/`. Nothing outside `src/cli.ts` reads process globals, so every command runs in-process in the tests (ADR-028).

---

## 6. Orchestrator

### 6.1. States

```
IDLE ─▶ PREFLIGHT ─▶ BASELINE ─▶ SPEC_CHECK ─▶ SELECT_FR ─▶ FEATURE_WRITE ─▶ FEATURE_REVIEW
                                                                                  │
      ┌───────────────────────────────────────────────────────────────────────────┘
      ▼
   BDD_RED ─▶ TDD_RED ─▶ CODE_GREEN ─▶ REFACTOR ─▶ BDD_CHECK ──(scenario still red)──▶ TDD_RED
                                                      │
                                                      ├─(scenario green, more left)─▶ BDD_RED
                                                      └─(last scenario green)─▶ [FR_REFACTOR] ─▶ QUALITY_GATE
                                                                                                  │
                                                                         QUALITY_FIX ◀─(fixable)──┤
                                                                                                  ▼
                                                                        FR_COMMIT ─▶ SELECT_FR ─▶ … ─▶ DONE
Any state ──▶ ABORTED (oid abort, after the current step)
```

`FR_REFACTOR` is **Planned (FR-REF-01)**. Feature files of **all** target FRs are written and reviewed before the first `BDD_RED` (ADR-013). A question to the human is not a state: the run emits `waiting_input` and stays in the state that asked (§10).

### 6.2. State table

| State | What happens | Exit gate |
|:--|:--|:--|
| `PREFLIGHT` | Acquires the lock. Checks tools, credentials and models, as `oid doctor` does (FR-INIT-05). Creates the run's worktree and branch (§6.11) and prepares its dependencies. | All OK. |
| `BASELINE` | Runs the existing unit and BDD suites and records the baseline (§6.14). | Suites green. A red suite asks the human: an inherited Red cannot be told apart from a new one. |
| `SPEC_CHECK` | Parses `SPEC.md` and validates the target FRs (§4.2). **Planned (FR-DEC-01):** Jev judges ambiguity and testability. | Deterministic. |
| `SELECT_FR` | Next pending FR in `progress.json`, or the ones given with `--fr`. | Deterministic. |
| `FEATURE_WRITE` | The feature-writing agent writes the FR's feature files (Gherkin only). | They parse; ≥ 1 scenario; traceability; the files the report declares match the diff. **Planned (FR-DEC-01):** Jev judges coverage of the FR. |
| `FEATURE_REVIEW` | The human approves, edits and approves, or rejects with a comment (back to `FEATURE_WRITE`). | Approval. The approved files are recorded. |
| `BDD_RED` | The step-writing agent writes the steps of the current scenario. The current scenario and the already-green ones run. | Steps loadable (§9.2); valid Red of the current scenario (§6.4); the others still green; approved feature files untouched. A scenario that passes at once is put to the human, who may accept it as a guard (ADR-049). |
| `TDD_RED` | The test-writing agent writes **one** unit test. The unit suite runs. | Valid Red of the new test; the rest still green. |
| `CODE_GREEN` | The coding agent writes the minimum code, with the reuse catalogue in its context (§7.8). Unit suite and type check. | Unit green + no new type error in source + integrity (§6.5). |
| `REFACTOR` | Micro refactor (§6.8): detectors on the lines just changed; if findings remain, the coding agent fixes exactly those. With no findings, no agent starts. | Acceptance criteria of §6.8; otherwise rollback. |
| `BDD_CHECK` | Runs the current scenario and the already-green ones. | Current green → next scenario or the gate; current red → `TDD_RED`. |
| `QUALITY_GATE` | Autofix, then format, lint, types, unit, BDD, coverage, extra checks and traceability (§6.9). | All pass. |
| `QUALITY_FIX` | Lint and type errors go to the agent that owns each file, under that agent's profile. | Back to `QUALITY_GATE`. |
| `FR_COMMIT` | Squash of the FR's checkpoints into one commit; `progress.json` updated. | Deterministic. |
| `DONE` | Releases the lock. **Planned (FR-TUI-04):** the final report. | — |

### 6.3. Implementation and invariants

The states are constants (`STATE` in `src/orchestrator/begin.ts`), and each is driven by its own `run-*.ts` module in `src/orchestrator/`; `transition()` emits every move as a `state_change` event and stops the run at the next move when `oid abort` asked for it. After each state that passes its gate, oid creates a checkpoint and saves `session.json` atomically (temporary file and `rename`).

**Invariant.** Every state after the start can be re-executed from its last checkpoint; that is what makes retries and `oid resume` safe (NFR-06). The states before the first checkpoint (up to `SELECT_FR`) are not resumed: a new run starts instead.

### 6.4. Red gate

Layers, from the cheapest to the most expensive (ADR-017). The classes are the same for the deterministic layer and for Jev:

| Class | Valid Red? | Next step |
|:--|:--|:--|
| `business_assertion` | Yes | Move on. |
| `missing_implementation` | Yes | Move on. |
| `test_bug` | No | Rollback and retry with the reason. |
| `environment` | No | Ask the human. |

**Layer 1: exit code.** A test that passes is not a Red.

**Layer 2: deterministic classification** of the runners' structured reports (vitest JSON, Cucumber Messages; never terminal text, NFR-07):

| Signal (TypeScript) | Where it appears | Class |
|:--|:--|:--|
| `Transform failed` (syntax error) in a test file | vitest file `failed` with no tests | `test_bug` |
| `UNDEFINED`, `PENDING` or `AMBIGUOUS` step | `testStepFinished` | `test_bug` |
| `Cannot find module '<path>'`, the path inside `paths.source` | vitest file message, or a step exception (dynamic import) | `missing_implementation` |
| `TypeError: (0 , <name>) is not a function` (or `is not a constructor`), `<name>` imported from a project module that does not export it | Test failure | `missing_implementation` |
| `Cannot find module` of a package outside the project | File or step message | `environment` |
| A test that was green fails | Comparison with the previous run | `test_bug` |
| A failure in a setup step of a scenario | Step exception | `test_bug`, unless `missing_implementation` |
| `AssertionError` on a line of a test or step file added since the last checkpoint | Test or step failure | `business_assertion` |
| `AssertionError` on a line that already existed, or any other runtime error | Test or step failure | ambiguous |

A missing export does not break the vitest file load: it arrives as `undefined` and fails when called. Whether it is a Red depends on whether the name exists in the project, which only the compiler API can answer.

**Layer 3: ambiguous cases.** Today they are an external decision: `oid verify red` exits 2 and whoever orchestrates answers with `--decide <class>`; `oid run` asks the human. **Planned (FR-DEC-01):** Jev answers them, together with whether the test is meaningful (§8.2), in three bands: a valid Red, not a Red, or a question to the person when Jev is unsure (§8.3).

### 6.5. Integrity

After each agent session, oid compares the worktree with the last checkpoint (`git diff --name-status` plus untracked files) and checks:

- Every changed file is within the write globs of the current **state** (§7.2).
- No approved scenario changed. A feature file is approved per scenario: a scenario is approved if one of its effective tags belongs to an FR past `bdd_red` or `done`, or if it is recorded as `pass`; the parts of the file outside any scenario are frozen while one of its scenarios is approved (ADR-040).
- In code states (`CODE_GREEN`, `REFACTOR`, `QUALITY_FIX`): no change to tests, steps or feature files, and no `integrity.forbidden_in_src` pattern in added lines (by default `@ts-ignore`, `@ts-expect-error`, `process.env.VITEST`, `import.meta.vitest`, `NODE_ENV === "test"`).
- In test states: no change to source code, and no `integrity.forbidden_in_tests` pattern in added lines (by default `.only(`, `.skip(`, `.todo(`, type-check suppressions, and `readFileSync` on a file of `paths.source`: a test that reads source as text breaks with refactors that change no behaviour).

A violation rolls the attempt back and retries it with the reason. The sandbox (§7.3) is the first line; this check is the second, and does not depend on the sandbox working (ADR-016). `oid verify integrity` runs the same check for the feature in focus, against its checkpoint (ADR-030).

### 6.6. Inner loop

The test-writing agent receives the scenario and its normalised failure, and writes **one** test for the next piece of logic. If it reports that no unit logic is left but the scenario is still red, the missing piece is wiring: the coding agent gets the BDD failure as its target. That is accepted only if the scenario already has at least one unit test: the article defines the inner loop as TDD cycles that drive the scenario to green, so every scenario but an accepted guard needs at least one (FR-RUN-04).

Limit: `limits.max_inner_iterations` per scenario (8). When reached, the run asks the human.

### 6.7. Regression

Two levels, as in `oid verify green` (ADR-030): during the cycle, a BDD run includes the current scenario and the scenarios of the feature already in `pass`; the quality gate runs the whole project, and a regression it finds there is put to the person (§6.9). The unit suite always runs in full. A test or scenario that was green and turns red invalidates the attempt. **Planned (FR-RUN-03 and FR-RUN-04, to be revised):** today every BDD run of the cycle still includes every passing scenario of the project. **Direction:** a regression found at the gate goes back to the coding agent, with the broken scenario as its failing test, before it reaches the person.

### 6.8. Refactor

The article includes refactoring in the cycle ("Simplify if needed. Tests stay green"), but in practice it does not happen: no signal demands it, its scope is too local to see duplication between features, and context isolation makes agents rewrite what already exists elsewhere. oid turns "refactor if needed" into **a closed list of concrete findings**, detected with tools, at three scales (ADR-020). That gives a signal (there are findings), a scope (these files, these lines) and a stopping condition (the findings are gone, none new, no metric worse). The reuse catalogue (§7.8) prevents duplication at the source.

#### Detectors

Bundled with oid; they do not depend on the project's own tools.

| Category | What it detects | TypeScript |
|:--|:--|:--|
| `complexity` | Cyclomatic complexity or nesting above the limit (10 and 4 by default) | Own analysis, compiler API |
| `duplication` | Duplicated blocks, across files too (6 lines and 50 tokens by default) | `jscpd` |
| `dead_code` | Unused exports, files and dependencies; unused locals; commented-out code | `knip`; own analysis |
| `magic_value` | Numeric literals and repeated strings that should be named constants (not 0, 1, -1, tests or encoding names; strings repeated 3 times) | Own analysis on the AST |
| `doc_drift` | JSDoc `@param` that does not match the signature; names cited in `README.md` and `docs/` that no longer exist | Own analysis |

A finding is `{ id, category, file, range, symbol?, detail, related? }`; `related` links the parts of a duplication. Limits are configurable in `refactor.detectors` (§16). Findings present at the start are the baseline (§6.14): the cycle only deals with what it adds; existing debt is `oid tidy`'s.

#### Micro scale: `REFACTOR`, after each Green

1. Detectors on the lines changed since the last checkpoint.
2. **Planned (FR-REF-03):** triage with Jev.
3. With no finding, the state passes without starting any agent: the common case, and free.
4. Otherwise the coding agent receives the exact list, with snippets and the reuse catalogue, and may only write source code.
5. Acceptance criteria (below); if not met, rollback.

#### Meso scale: `FR_REFACTOR` — Planned (FR-REF-01, FR-REF-02)

With all scenarios green and before the quality gate: detectors on **the FR's whole diff**, tests, steps and documentation included; a duplication counts if one of its parts is FR code. Findings are grouped into items (both sides of a duplication together), each fixed by the agent that owns the files, one checkpoint per accepted item; a rejected item is rolled back and reported.

**Two phases, in this order, never mixed.** First the **source phase**: items that change source code, with every test and step fixed, so the tests prove the behaviour did not change. Then the **test phase**: items that change tests and steps, with the source fixed, so the code proves the tests still check the same thing (and the guarantee below proves they did not get weaker). The test phase comes second so that the tests follow the cleaned structure of the code. A change that would need both, such as renaming a function the tests import, takes three legal steps: the source phase adds the new name and keeps the old one as an alias; the test phase moves the tests to the new name; a last source item removes the alias, with the tests fixed on the new name.

**Refactored tests keep testing.** In a temporary worktree with the code from where the FR started and the refactored tests on top, every test or scenario added in the FR must fail, and every earlier one must pass. A refactored test that passes against the old code has stopped testing something.

#### Macro scale: `oid tidy` — Planned (FR-TIDY, §14.1)

#### Acceptance criteria

All deterministic, at every scale:

- **Behaviour does not change.** Unit suite and BDD (with regression) green; no new type errors.
- **Integrity holds.** A source refactor does not touch tests; a test refactor does not touch source; source and tests never change in the same item. The micro scale changes source only, never tests; tests are refactored only in the test phase of the meso scale and in `oid tidy`, with the same order. A change that needs both goes through an alias (meso scale, above).
- **The item's findings disappear**, and no new one appears in the touched files.
- **Nothing gets worse.** The complexity of the touched functions and the duplicated lines do not increase.
- **No premature abstraction.** Every new exported symbol has at least two references. A single-use helper is accepted only if the finding was about complexity.
- **The list is closed.** The agent cannot take the chance to improve other things.

These criteria also stop over-engineering: an abstraction that adds more than it removes rejects itself. (Today the micro scale checks a subset of them; §20.3.)

#### Health metrics

`oid metrics` records a snapshot in `.outside-in/metrics.jsonl`: the number of findings per category and the duplication percentage, for source and for tests separately, so that duplication in tests does not hide the one in the code (ADR-027). `--changed` keeps only the findings on lines changed since the last commit that the baseline does not hold. **Direction:** a snapshot per finished FR, its trend in the progress view and the final report, and the triggers that propose `oid tidy`.

### 6.9. Quality gate and fixes

oid first runs the project's autofixes (formatter, and the linter's automatic fixes; ADR-037) and checkpoints them if they changed anything. Then:

| Check | If it fails |
|:--|:--|
| Format (if configured) | Should not happen after the autofix: an error. |
| Lint (if configured; new errors only) | `QUALITY_FIX`: the errors go to the agent that owns each file (source → coding agent, unit tests → test-writing agent, steps → step-writing agent). |
| Types (whole project; new errors only) | `QUALITY_FIX`, as lint. |
| Unit / BDD | Asks the human: it should not happen if the cycle was correct. |
| Coverage (if configured) | Asks the human: code without tests means over-implementation, and adding tests afterwards would break test-first. |
| Extra checks (`commands.extra_checks`) | Asks the human, with the output. |
| Traceability (§4.3) | Asks the human. |

`QUALITY_FIX` respects `max_retries` and integrity; after each fix the unit and BDD suites run again before the gate.

### 6.10. Retries and escalation

Each retry starts from the last checkpoint, without the failed attempt's code, and receives the rejection reason and its number. There are `limits.max_retries` + 1 attempts (ADR-047):

| Attempt | Model / `thinkingLevel` |
|:--|:--|
| The first | `models.default` at `medium`. **Planned (FR-DEC-01):** effort scoring chooses it (§8.4). |
| Each intermediate one | One level higher, up to `high` |
| The last | `models.strong` at `high` |

With `max_retries: 0` the first failure ends the run with its error. When retries run out, the run asks the human (FR-RUN-11). **Planned (FR-DEC-04):** a stuck loop (the same root cause in the last failures) asks before the retries run out.

### 6.11. Git: worktree, checkpoints and squash

**Isolation.** With `settings.isolation: "worktree"` (the default), `PREFLIGHT` creates a worktree in `settings.worktree_dir` (`../.oid-worktrees/<repo>/<runId>`) on a new branch (`settings.branch_prefix` + the name given with `--branch`, or `run-<date>-<time>`) from `HEAD` of the main working copy. All work happens there; the user's copy is never touched. Dependencies are shared with the main copy while the lockfile does not change (§9.2). With `"in_place"` the run works on a new branch in the user's copy, which must be clean (see §20.3).

**Checkpoints.** Each passed gate is a commit on the run's branch. Rolling back a failed attempt is `git reset --hard <last checkpoint>` plus `git clean -fd` in the state's writable paths (ADR-010).

**Squash per FR.** In `FR_COMMIT`, the FR's checkpoints become one commit, whose message follows `settings.commit_template` (by default `feat(<scope>): <FR-ID> <title>`, the scope being the ID's area in lowercase) and whose body lists the scenarios. The result is a branch with one clean commit per FR, which the human reviews and merges. oid never touches the main branch.

**Planned (FR-RUN-12):** `oid clean` removes the worktrees and run data of finished runs, never their branches.

### 6.12. Human edits

When the human edits files in answer to a question (or in `FEATURE_REVIEW`), oid accepts the changes without glob restrictions, logs each as `human_edit` and checkpoints them. If `SPEC.md` changed, the affected FRs go back to `SPEC_CHECK`.

### 6.13. Resuming and concurrency

- One run per repository: `.outside-in/lock` holds the PID. If it exists and the process is alive, `oid run` refuses; if the process died, `oid resume` releases it.
- `oid resume` reads `session.json`, discards what the run left after its last checkpoint (and says what), and re-executes the state it stopped in. A pending question is asked again.
- `oid abort` asks the running process to stop; it finishes the current step and stops at the next move, in `ABORTED`.

### 6.14. Baseline (frozen debt)

Real projects start with type errors, lint warnings, detector findings and traceability gaps unrelated to the feature at hand. Requiring a clean start would block oid on almost any repository; ignoring the debt would make the gates meaningless. So the existing debt is recorded at the start and the gates judge **only what is new** (ADR-021). Red tests are never frozen: a red suite at the start asks the human.

---

## 7. Agents

### 7.1. Sessions

Each task is a new session of `@earendil-works/pi-coding-agent`, opened in `src/agents/runner.ts` (ADR-002, ADR-009):

- **oid's own `agentDir` and system prompt, always** (ADR-008). Without them Pi reads the user's settings, skills and context files. `systemPromptOverride` replaces only the preamble; skills, context files, extensions, prompt templates and themes are turned off. The project's `AGENTS.md` is not given to the agents: its conventions reach them through `paths.conventions` (ADR-051). A test checks every call to `createAgentSession`.
- **Clean context, saved transcript.** `SessionManager.create` on `.outside-in/runs/<runId>/sessions/`: the agent sees nothing of earlier sessions, and the transcript can be opened afterwards.
- **One array for `tools` and `customTools`** (ADR-007): a custom tool missing from the allowlist is never offered, and nothing reports it.
- **A watchdog** ends a session that passes `agent_timeout_s` or `agent_max_turns`. It races `prompt()` and `abort()` against its own limit and abandons the session, since a tool that ignores the abort signal can keep both pending forever (`DOMAIN.md`).
- **Pi v1, pinned exactly** (ADR-003).

### 7.2. Profiles per state

Permissions depend on the state, not only on the role: the same kind of agent writes feature files in one state and steps in another. Globs come from `paths` (§16).

| State | Agent | Tools | Write | Read |
|:--|:--|:--|:--|:--|
| `FEATURE_WRITE` | feature writer | read, grep, find, ls, write, edit, `report` | `bdd_features` | the spec and design documents (`paths.design`), `bdd_features`, conventions |
| `BDD_RED` | step writer | same, plus `try`, `request_dependency` | `bdd_steps` | `bdd_features`, `bdd_steps`, `DOMAIN.md`, conventions |
| `TDD_RED` | test writer | same as `BDD_RED` | `unit_tests` | unit tests, feature files, steps, conventions |
| `CODE_GREEN`, `REFACTOR` | coding agent | same, plus `bash` | `source` | the whole repo |
| `QUALITY_FIX` | the owner of each file | the owner's profile | the owner's | the owner's |
| Phase 0 — Planned (FR-SPEC-01) | spec agent | read, grep, find, ls, write, edit | `paths.design` | the whole repo |

Common rules:

- Only the coding agent has `bash` (ADR-029).
- Nobody writes `progress.json`, `package.json`, lockfiles, `tsconfig*.json`, the vitest and cucumber configuration, `.outside-in*` or `.git/**`.
- Nobody reads secrets: environment files, keys and credential stores (`.env`, `.env.*`, `**/*.pem`, `**/*.key`, `**/secrets/**`, `**/auth.json`) and `~/.ssh`, `~/.aws`, `~/.gnupg`. A fixed list, with no override and no confirmation; that content never reaches a model provider (FR-AGENT-03).
- Test agents get the public signatures of `src/`, not its bodies (FR-AGENT-09).

### 7.3. Tools and sandbox

**Custom tools.** `report` (every agent, §7.6), `try` (the agents that write steps, tests or code: one test or scenario, then the type check and the linter on the changed files, recording nothing; FR-VERIFY-09) and `request_dependency` (§7.7).

**Blocking happens in `session.agent.beforeToolCall`**, chained to the previous handler (Pi's extensions are installed on the same hook). A blocked call returns `{ block: true, reason }`, and the reason reaches the model as the tool result. More than 5 denials in a session abort it.

`checkPaths` relies on two pieces (ADR-006):

- **Path argument table (`TOOL_PATH_ARGS`).** Which arguments of each tool hold a path. A test fails if a registered tool has a path-like parameter missing from the table, so adding a tool cannot silently bypass the sandbox.
- **A single containment authority (`containment.ts`).** It resolves symlinks on both sides (the requested path and the root), and for a path that does not exist yet, its nearest existing ancestor. String comparison is not enough: `features/../.git/config` passes a `startsWith`.

`grep`, `find` and `ls` without a path are treated as asking for the worktree root, which only the coding agent may read.

**The coding agent's shell** (ADR-029) goes through three checks in the same hook:

1. **Containment.** Every path in the command, including inside `bash -c`, `node -e` and similar wrappers, resolves inside the worktree; nothing only the orchestrator writes can be modified. The shared `node_modules` resolves to the main copy, so it stays out of reach.
2. **Profile policy.** Deny-by-default, an allow list of commands (the project's gate commands); a deny wins.
3. **Classifier — Planned (FR-DEC).** Jev decides what the floor cannot settle (credentials, private data leaving the machine, commands dangerous in this step); without it the floor holds.

**Direction:** reading a dependency's `.d.ts` through the shared `node_modules`, and an ignored scratch directory where the agent can run `node` or `tsx`, are open needs.

### 7.4. Hints after a failed `edit`

A coding agent's most common failure is an `edit` whose anchor does not match. A deterministic hook in `session.agent.afterToolCall` adds a specific hint to the error ("copy the anchor exactly", "add more lines to make it unique", "the replacement is identical") (FR-AGENT-06).

### 7.5. Productive response and provider errors

`session.prompt()` resolves the same way when the model worked and when the provider failed: the error arrives as an assistant message with `stopReason: "error"`. After each prompt, `assertProductiveResponse` inspects the `message_end` events (FR-AGENT-05):

| Situation | Handling |
|:--|:--|
| A transient provider error (rate limit, 5xx, network) | Retry with backoff (3 times, at 5, 20 and 60 s). It does **not** consume a methodology attempt. |
| A permanent error (authentication, unknown model, quota) | Stops: retrying would burn money (see §20.3). |
| No assistant message, or all empty | A failed attempt: the agent did nothing. |
| Session ended by the watchdog | A failed attempt, with the reason. |

Only a productive response is examined further: its `report` (§7.6), then the diff (§6.5), then the tests.

### 7.6. Completion report

```typescript
type AgentReport =
  | { status: "done"; files: string[]; summary: string; test?: string }   // test: the new test's id, in TDD_RED
  | { status: "done"; files: []; summary: string; reason: "no_unit_logic_left" }
  | { status: "blocked"; reason: "spec_conflict" | "spec_gap" | "cannot_test" | "other"; detail: string };
```

No report at the end of the session is a failed attempt. In `TDD_RED`, `test` is mandatory (`<file> > <describe> > <name>`), and oid runs it by that id. `blocked` puts the agent's reason to the human (FR-RUN-11).

### 7.7. Dependencies

Agents cannot edit `package.json` or the lockfile. They ask with `request_dependency({ name, version?, dev, reason })`; a human approves it, oid installs it with the project's package manager in the worktree, and the change goes into the next checkpoint. If the worktree shared `node_modules` with the main copy, it gets its own first (FR-AGENT-07; see §20.3).

### 7.8. Context per task

Built with deterministic code. Each part has a size budget; past it, the rest is trimmed by priority or listed by path for the agent to read.

| Task | Receives | Does not receive |
|:--|:--|:--|
| `FEATURE_WRITE` | The FR and the NFRs; the design passages that share the most terms with it; the existing feature files closest to it, as examples of style; the step catalogue (existing step patterns, the closest first); the list of feature files; the human's comment after a rejection | code, tests |
| `BDD_RED` | The current scenario, the existing steps, public signatures | bodies of `src/`, unit tests |
| `TDD_RED` | The scenario, its normalised failure, its step definitions, public signatures | bodies of `src/`, other scenarios |
| `CODE_GREEN` | The red test in full, its normalised failure, the `src/` files it imports (transitively), the reuse catalogue | other scenarios, earlier attempts, raw output |
| `REFACTOR` | The findings with their snippets, the affected files, the reuse catalogue | other findings |
| `QUALITY_FIX` | The errors, the affected files | everything else |

**Reuse catalogue.** Context isolation means the agent sees little code, so it does not know what already exists. The catalogue lists every exported symbol of the project with its signature and the first line of its JSDoc, without bodies, grouped by module. The modules the task uses come first, then those in the same folders, then those it mentions by name; past 30,000 characters the rest are listed by path. The coding agent's prompt tells it to search the catalogue before writing a new function or constant.

**Project conventions.** The files in `paths.conventions` go to every agent that writes feature files, steps, tests or code, within 8,000 characters, and take precedence over the generic guidance (ADR-051).

A human's note in answer to a question goes to the next affected task.

### 7.9. Prompts

`src/agents/prompts/*.ts`, one per state, with the parts every agent shares in `shared.ts`: who the agent is, what oid is and what it checks, the goal of the whole system, and what the agent may read and write, generated from its profile so that the statement and the sandbox cannot differ. Every prompt ends with the obligation to call `report`. Agents never run git; the ones that write tests or code check their work with `try`, and oid's gates judge it.

Each state's prompt is a **skill**: its trigger is the state, and its success criterion is the gate. Numbered steps stay: they keep the agent from improvising the order, and what fails is usually what is missing around them (ADR-057). Each prompt is checked against this list:

- **Step 0, the input:** what the agent has (the scenario, the failure, the files), stated before it acts, so that it does not drift into orientation.
- **A reason for any order that is not obvious.**
- **The success criterion in plain words:** the gate it must pass, so that the agent knows what oid will accept before it reports.
- **Negative constraints at the step they apply to,** not in the shared preamble.
- **A short checklist at the end** of a prompt with five steps or more.
- **No informational preamble before the steps.** `shared.ts` (about 760 words, before every state's steps) keeps the identity short, with traits and their reasons; what is operational moves to the step that needs it. Its fix-at-cause trait keeps its value and its why; its "never" clauses that the sandbox and integrity already enforce leave the prompt, and the one they cannot enforce (shaping code to one test) moves to `CODE_GREEN`.

Prompt wording is environment, not contract: unit tests check the mechanism (generated permissions, the conventions present, the shared part once, the report obligation last), and wording is judged by runs (§19).

Prompts are written in English with no examples in other languages: an English instruction illustrated with words in another language is a strong signal for the model, which overfits to it (NFR-11). They are validated with real runs (§19).

---

## 8. Decisions (Jev) — Planned (FR-DEC)

Jev answers the semantic micro-decisions that code cannot, through Pi's classifier API (ADR-004). Until it exists, every point below falls to its deterministic default or to the human.

### 8.1. Interface

oid keeps a thin interface of its own, so the orchestrator does not depend on Pi's types and tests can replace it:

```typescript
export interface DecisionAdapter {
  evaluate<Q extends Record<string, Question>>(input: {
    purpose: DecisionPurpose;          // "red_gate", "effort", … for logging and metrics
    state: Record<string, string>;     // context shared by every question
    questions: Q;
  }): Promise<Answers<Q>>;
}

export type Question =                  // the shapes of pi-ai's ClassifierQuestion
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }               // ordered levels
  | { type: "bool"; instructions: string; criteria: { true: string; false: string } };
```

The implementation calls `modelRuntime.classify()` with the `decisions` role's model (ADR-048), pinned to a versioned identifier (`typesafe/jev-1.13` on OpenRouter) so that thresholds stay reproducible. `classify()` does not reject on errors: it returns `stopReason: "error"`, which counts as "no answer" (§8.6). Usage is added to the budget. Pi calls `bool` what Jev calls `noul`. **One call per decision point**, with all its questions over the same state.

A local model (`llama-cpp-classify`, served by `llama-server`) can replace Jev with the same API; what it needs is calibration, not integration (§14, direction).

### 8.2. Catalogue

**Ask per aspect, not one broad question.** The model answers many questions over the same state at no extra cost. Asking about each aspect of a decision (is the failure in a Then step? does it concern the scenario's behaviour? is the test meaningful?) is more precise than one broad question, and it tells which aspect failed, so the next attempt gets a specific note (§3.2, principle 7). **The order of authority holds:** code decides first, the model only what code cannot, the human what the model is not sure of; the model classifies evidence and is never the source of the contract (it approves no spec, feature file or revise).


| Point | State | Questions | Policy |
|:--|:--|:--|:--|
| Spec check | FR, NFRs, glossary | `noul ambiguous`, `noul testable` | `ambiguous > 0.70` or `testable < 0.50` → ask |
| Features written | FR, NFRs, feature files | `noul covers_fr`, `noul has_redundant`, `noul has_implementation_details`, `noul asserts_ending` (a scenario asserts where the process stops, not a milestone) | `covers_fr < 0.60`, `has_implementation_details > 0.70` or `asserts_ending > 0.70` → retry before review; probabilities shown in the review |
| Red gate + test quality | trimmed trace, test, scenario | `choice failure_kind`, `noul in_then_step`, `noul about_scenario_behaviour`, `noul test_is_meaningful`, `noul asserts_only_absence` | class per §6.4; `test_is_meaningful < 0.50` → `test_bug`; `asserts_only_absence` is a warning |
| Effort | target test, signatures | `score complexity [trivial … algorithmic]` | §8.4 |
| Stuck loop | last 3 normalised failures | `noul same_root_cause` | `> 0.80` → ask without exhausting retries |
| Finding triage | every finding in scope | one `bool worth_fixing` per finding | `< 0.60` → discarded |
| Refactor result | the finding, the diff that resolves it | `noul changes_design` (true: the design changed; false: only the appearance, such as a constant named after its value) | `< 0.50` → rejected, with that reason for the next attempt |
| Guard (with the human) | the scenario, its steps, the code | `noul describes_absence`, `noul then_checks_observable` | shown to the human with the question; never decides alone (the contract is the human's) |
| After done | FR, its scenarios, the review comment or bug | `noul scenarios_still_describe_fr` | a suggestion: `reopen` or `revise`; the human decides a revise |
| Definition of done | FR diff, FR, scenarios | `noul dead_code`, `noul out_of_scope`, `score spec_alignment` | **Informational**: warnings in the report and the commit body (ADR-022) |

### 8.3. Thresholds and calibration

Every point answers in **three bands**: above its upper threshold yes, below its lower threshold no, and between them a question to the person, never a silent default. The values above are the initial thresholds; they are configurable and live in the project's configuration, since they are calibrated per project. Each point starts in **shadow mode**: Jev answers, the person decides, and the agreement is recorded; the point lets Jev decide alone only when the record shows enough agreement (ADR-004). Every decision is logged with its probabilities and, if it went to the human, their answer; `oid decisions` shows the agreement per point, which is the data for recalibrating them (FR-DEC-03).

### 8.4. Effort

Applies to the first attempt of the test-writing and coding agents (§6.10):

| `complexity` | `thinkingLevel` | Model |
|:--|:--|:--|
| < 1.5 | `minimal` | `models.fast` |
| 1.5 – 2.5 | `medium` | `models.default` |
| > 2.5 | `high` | `models.default` |

oid does not go below `minimal` for tasks that write code.

### 8.5. State preparation

From a trace: the exception type, its message and the project's frames, not the libraries'. Each field is capped at 2,000 characters. Criteria always carry descriptions, not bare labels: they give better-calibrated probabilities.

### 8.6. Service failures

2 s timeout and one retry. With no answer, the conservative default (FR-DEC-02): Red gate → `test_bug` unless the deterministic layer decided; test quality → accepted; effort → `medium`; spec and features → ask; stuck loop → no; triage → keep every finding; definition of done → skipped with a warning.

---

## 9. Stack: TypeScript

### 9.1. Tools

| Function | Tool | How oid uses it |
|:--|:--|:--|
| BDD | `cucumber-js` (with `tsx`) | `commands.bdd` + `--format message:<file>` + the locations of the selected scenarios; whole-suite runs add `--tags 'not @wip'` |
| Unit | `vitest` | `commands.unit` + `--reporter=json --outputFile=<file>` + files and `-t <name>`; `.outside-in/` is excluded |
| Types | `tsc --noEmit` | In `CODE_GREEN`, only new errors in source; in the gate, the whole project |
| Format and lint | The project's own, if any | ESLint and Prettier are recognised and get their fix and check flags (ADR-037); another tool is run as it is and judged by its exit code |
| Detectors | `knip`, `jscpd`, own analysis | Shipped with oid |
| Other checks | `commands.extra_checks` | For example a frontend build, when `tsc` does not check every file (Buddy added `vite build` after a refactor left orphaned CSS with `tsc` green) |

`oid init` infers the commands from `package.json` and the cucumber and vitest configuration; they may carry environment variables. oid appends its own arguments. Every command has a time limit and is stopped with its whole process group (ADR-043).

### 9.2. Runner behaviour that shapes the design

- **Reports, not terminal text.** cucumber-js 13 has no `json` or `junit` formatter: the structured format is Cucumber Messages. vitest's JSON report gives load errors per file and failures per test (`DOMAIN.md`).
- **Loadable steps.** If a step file **statically** imports a module or export that does not exist yet, cucumber-js never starts: no scenario runs and no report is written. In `BDD_RED` that is the normal case. So before running anything, oid checks that changed step files statically import only source that exists; what does not exist yet is imported dynamically inside the step, and the scenario fails at runtime with `Cannot find module` (ADR-018). A violation is `test_bug`, with the imports to change.
- **Skipped scenarios.** A skipped scenario is tagged `@wip` (the only change oid makes to an approved feature file) and left out of regression.
- **Dependencies in the worktree.** If the worktree's lockfile is identical to the main copy's, `node_modules` is a link to the main copy's; with the first new dependency, the worktree gets its own.

### 9.3. Analysis with the compiler API

In-process, with the classic compiler API of `typescript@6.0.3` under an npm alias, separate from the TypeScript 7 that compiles oid (ADR-027): signatures of exported symbols (never bodies), the reuse catalogue, transitive imports of a test, symbol resolution for the Red gate and the loadable-steps rule, the own detectors, and references of a symbol. `knip` and `jscpd` run as processes with configuration generated by oid; `knip`'s entry points are inferred from `package.json` and the test commands, plus `refactor.entry`.

---

## 10. Human feedback

### 10.1. Questions and actions

| When | Actions |
|:--|:--|
| Red suite at `BASELINE` | View the failures · Continue · Abort |
| Feature review | Approve · Edit and approve · Reject with a comment |
| A scenario passes before any code | Accept it as a guard (with a reason) · Retry · Skip the scenario · Abort |
| Retries exhausted, an agent blocked, or the inner loop at its limit | Retry with a note · Rewrite the last unit test · Rewrite the steps · Skip the scenario · Skip the FR · Abort (the ones that apply to the state) |
| Budget exhausted | Extend · Abort |
| Ambiguous Red (until Jev) | It is a valid Red (with its class) · It is a test bug |

What skipping means, within the article's schema, which has no state for it (FR-RUN-11):

- **Skip the scenario.** Its partial work goes into a `wip` commit kept under a ref of the run (`refs/oid/wip/<run>/<FR>/<n>`); the scenario is tagged `@wip` and left out of regression, and the FR cannot be `done`.
- **Skip the FR.** Back to `pending` (no step, no scenarios); its changes are discarded, and the run continues with the next one.
- **Rewrite the last unit test** returns to the checkpoint before the last `TDD_RED`; **rewrite the steps** goes back to `BDD_RED` with a note, keeping the code (ADR-038).

The reason of every skip goes to the event log.

### 10.2. Mechanics

The run emits `waiting_input` with the request (`{ id, prompt, actions }`) and waits for one answer. Without a TTY, the session is saved and the process exits with code 3; `oid resume` asks again. Today the terminal asks with plain line prompts.

**Planned:** decision cards and feature review in the terminal interface (FR-TUI-02); **Talk it through** for problems worth discussing (FR-TUI-05): a chat with an agent that has the problem's context, read tools over the worktree, write access only to `SPEC.md` when the problem is in the spec, and a `resolve({ action, note })` tool limited to the actions the run offers, so the decision is still one of the run's; and a notification command on every question (FR-TUI-06).

---

## 11. Budget and limits

| Limit | Scope | Default | Configurable |
|:--|:--|:--|:--|
| `max_retries` | per state; retries after the first attempt, 0 fails fast (ADR-047) | 3 | yes |
| `max_inner_iterations` | per scenario | 8 | yes |
| `agent_timeout_s` | per session | 600 | yes |
| `agent_max_turns` | per session | 40 | yes |
| `command_timeout_s` | per configured command (ADR-043) | 600 | yes |
| `cost_limit_usd` | per run | none | yes |
| `cost_limit_fr_usd` | per FR | none | yes |
| sandbox denials | per session, before it is aborted | 5 | no |
| provider retries | per call; do not consume an attempt | 3, at 5/20/60 s | no |
| reuse catalogue | per task, the part with signatures | 30,000 characters | no |
| conventions text | per task, all `paths.conventions` files (ADR-051) | 8,000 characters | no |
| step catalogue | per `FEATURE_WRITE` task | 8,000 characters | no |

Cost is the sum of `usage.cost.total` on every assistant `message_end`, plus Jev's calls. It is checked **before every billable call** (NFR-12), and after every assistant message that another call will follow, so a session can be stopped half-way. Reaching a limit asks: **Extend** raises a cost limit by its own size again, or, after a turn or time limit, rolls back to where the call began and runs the task again with that limit doubled, without counting a retry; **Abort** ends the run with exit 4.

---

## 12. Events, interface and report

### 12.1. Events

Everything is written to `.outside-in/runs/<runId>/events.jsonl` (NFR-08), whether there is an interface or not. Each event carries `ts` and `runId`. Today's types (`src/events/types.ts`): `state_change`, `agent_start`, `attempt_rejected`, `waiting_input`, `human_edit`, `guard_accepted`, `resumed` and `error`. Every view is built over this stream and holds no state the orchestrator needs (ADR-014).

**Direction:** events for test runs, checkpoints and rollbacks, sandbox denials, integrity violations, dependencies, Jev's decisions and refactor findings, as the views and the report need them. A `tool_execution_end` event carries no arguments, so a tool call's path comes from pairing it with its start by `toolCallId`.

### 12.2. Terminal interface

Today: plain output, one line per event (FR-TUI-03), and questions as line prompts.

**Planned (FR-TUI-01, 02, 07):** an interface on `@earendil-works/pi-tui`, the same base as Pi, with two modes. **Progress** while the cycle runs on its own: a compact view updated in place, with the current FR, the run's progress, time and cost, a code-health line, the state with the active agent, its attempt and the file it touches, the FR's scenarios with their last failure, and the latest decisions and git events; details (trace, diff, transcript) open on demand. **Conversation** when a question arrives: the progress collapses and the question takes the screen, as a card, as the feature review with Jev's scores, or as "Talk it through". `oid watch` shows the same view from another terminal, or replays a finished run from its event log.

### 12.3. Final report — Planned (FR-TUI-04)

At the end of a run, `report.md` and a summary in the terminal: features done, skipped and pending; scenarios by state; warnings of the definition of done; refactor findings per scale; health trend; human interventions; retries per state; cost; and the branch and how to merge it.

### 12.4. Web dashboard — Direction

Another view over the same events, to follow a run from the browser or a phone: local only by default, with a random token per run, and the same questions as the terminal (whoever answers first wins).

---

## 13. Phase 0: `oid spec` — Planned (FR-SPEC)

Always interactive and in a session of its own, so that research and brainstorming do not consume the cycle's context.

- **Pi's interactive mode** (`InteractiveMode`), with oid's runtime: its `agentDir`, the spec agent's prompt, tools and model. It calls `process.exit` when the user leaves, so it runs in a child process and the parent runs the exit gate (ADR-015).
- **Sandbox as an extension.** Interactive mode can replace the session (`/new`), which drops a hook installed by hand; the spec agent's sandbox is an extension (`tool_call`), which survives, with the same `checkPaths` (ADR-006).
- **The spec agent writes the documents** from the research and the conversation; the human reviews and edits them. The conversation may be in any language; the documents are written in English (ADR-053).
- **`/check`** runs the exit gate's deterministic checks inside the chat.
- **Exit gate.** Deterministic: files present, `SPEC.md` parses, unique IDs, no acceptance criteria. Jev: the article's six questions (goal, MVP, out of scope, cross-cutting rules, domain, stack); low ones are listed as gaps. Then explicit confirmation from the human; no threshold replaces it.
- On confirmation, new FRs go to `progress.json` as `pending` and the design documents are committed on the user's current branch: the only commit oid makes outside its own branches (NFR-04).
- `oid spec --fr` on an existing FR is a changed requirement: it calls `oid progress revise` (ADR-039).

---

## 14. Other workflows

### 14.1. Periodic cleanup: `oid tidy` — Planned (FR-TIDY)

The cleanup that otherwise gets requested by hand every few sprints, over **the whole project, existing debt included**.

```
TIDY_ANALYZE ─▶ TIDY_TRIAGE ─▶ TIDY_PLAN ─▶ TIDY_REVIEW ─▶ (per item) TIDY_ITEM ─▶ TIDY_VERIFY ─▶ TIDY_COMMIT ─▶ … ─▶ DONE
```

- **Analyse and triage.** The detectors over the project (or the `--scope` paths), and Jev's triage.
- **Plan.** A read-only agent groups the findings into small, independent items, each with its findings, files and type (`refactor` or `docs`). oid checks that every cited finding exists and that no item mixes source and tests, and keeps the most valuable ones.
- **Review.** The human approves, removes or reorders items before anything changes.
- **Apply and verify.** Each item by the agent that owns its files, with the acceptance criteria of §6.8. A test touched by an item keeps its id and at least its number of assertions (old tests have no recorded Red to check against). A failed item is rolled back and reported.
- **Commit.** One commit per item, on a branch of its own.
- **Propose.** At the end of a run, oid proposes a cleanup when enough features passed since the last one or a health metric worsened past its threshold. It never starts one by itself: reviewing the plan is part of the value.
- `SPEC.md`, `DOMAIN.md` and `DECISIONS.md` are not touched; names they cite that no longer exist are listed as drift to review.

### 14.2. `fix-bug` — Direction

The test-first principle applied to a bug: **production code is not touched until a test shows the failure**. The failing test is the reproduction; if one cannot be written, the bug is not understood. The flow: understand the report (no code run), locate the affected modules (read-only), choose the kind of test (a new regression test by default; a missing unit test; changing an existing test only with human confirmation, since that is exactly the door to test cheating), confirm it red, fix the minimum, quality gate, `fix(...)` commit. Because the test is confirmed red before the code changes, and the coding agent cannot touch it afterwards, "reintroduce the bug to check the test" is done by construction.

### 14.3. Claude Code as the agents' harness — Direction

oid's agents run on Pi today (ADR-002). Some people will want them to run in Claude Code instead: to use a subscription they already have, or because they prefer how it writes code. The direction is a second harness behind the same boundary of `src/agents/` (§5): each of oid's agents defined for Claude Code with the same role, prompt, context and limits, and the boundaries built with what that harness offers (its hooks, its permissions, its subagents). The state machine, the gates and the evidence stay oid's, whichever harness runs the agent. That adapter would be part of the product, designed with the questions of §3.1; the hook oid uses for its own development today (`scripts/claude-hook.mjs`, ADR-045, ADR-046) is not it.

### 14.4. `new-project` and Python — Direction

`new-project`: the full Phase 0, deterministic scaffolding (package, TypeScript, cucumber and vitest configuration), and the normal cycle over the MVP's FRs. Python: the same contract behind the stack seam (§5), with `uv`, `pytest-bdd` (one test per scenario through `@scenario`, never `scenarios(...)`, which would bind unwritten scenarios), `pytest`, `ruff` and `mypy`, and Python's own Red signals (`ModuleNotFoundError`, `AttributeError` or `NameError` for a project name is `missing_implementation`).

---

## 15. CLI

| Command | Function |
|:--|:--|
| `oid init [--import-progress [PATH]]` | Detects the stack, paths and commands and writes `.outside-in.json`; ignores `.outside-in/`; creates `progress.json` from `SPEC.md` if none exists; offers `oid setup` when the user has none. `--import-progress` converts a progress file of an earlier schema and lists what could not be carried over (FR-INIT-01..03). |
| `oid setup [--provider P] [--login \| --api-key-stdin] [--import-pi] [--model ROLE=provider/id]…` | The user's providers, credentials and models per role (§16.1, FR-INIT-04). |
| `oid doctor [--connect]` | Checks, without changing anything, the project's tools, a credential per provider and each role's model; `--connect` makes one minimal call per provider (FR-INIT-05). |
| `oid progress <subcommand>` | Reads and writes `progress.json` (below). |
| `oid check [--json]` | Consistency of `SPEC.md`, traceability and progress (§4.3), without running anything else (FR-CHECK). |
| `oid metrics [--changed] [--baseline]` | Code-health findings and snapshot (§6.8, FR-MET). |
| `oid verify red <target> [--decide <class>]` | The Red gate (§6.4) on a unit test (`"<file> > <name>"`) or a scenario (`<file>:<line>` or its name). |
| `oid verify green [<target>…]` | A green of the features it verifies (ADR-030). |
| `oid verify integrity [--step S] [--path FILE]` | Integrity (§6.5); `--path` answers before a file is changed. |
| `oid try <target> [--dry-run]` | Runs one test or scenario, then the type check and the linter on the changed files; records nothing (FR-VERIFY-09). |
| `oid run [--fr ID…] [--max-frs N] [--branch NAME]` | Runs the cycle on the pending FRs in order, or on the given ones. |
| `oid resume` | Continues a stopped run (§6.13). |
| `oid abort` | Stops the running run after its current step. |
| `oid clean [--run ID]` | **Planned (FR-RUN-12).** |
| `oid watch [--run ID]` | **Planned (FR-TUI-07).** |
| `oid decisions [--purpose P]` | **Planned (FR-DEC-03).** |
| `oid spec [--fr ID]` | **Planned (FR-SPEC).** |
| `oid tidy [--scope PATH…] [--max-items N] [--yes]` | **Planned (FR-TIDY).** |
| `oid --help`, `oid <command> [<subcommand>] --help`, `oid --version` | Help and version (FR-CLI-01, FR-CLI-03). |

```
oid progress current | status [--all] | show FR-xxx
oid progress add FR-xxx "Title"             # the FR must exist in SPEC.md
oid progress focus FR-xxx | unfocus
oid progress step FR-xxx <cycle_step>       # rejects invalid transitions (§4.4)
oid progress scenario pass|fail|pending|drop FR-xxx "Scenario name"
oid progress done FR-xxx
oid progress revise FR-xxx                  # changed requirement (ADR-039)
oid progress reopen FR-xxx [--no-focus]     # review of a done feature (ADR-039)
```

`oid progress` uses the same `src/artifacts/progress.ts` as the orchestrator, so the rules have one implementation. It serves an agent guided by an `AGENTS.md` as much as it serves oid.

Exit codes of `oid run` and `oid resume`: `0` completed · `1` error · `2` aborted · `3` waiting for input with no terminal · `4` budget exhausted. `oid verify red`: `0` valid Red · `1` not a valid Red · `2` needs a decision.

---

## 16. Configuration

### `.outside-in.json` (the project's)

Validated at startup; unknown keys are refused. The schema is `src/artifacts/project-config.ts`.

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
    "progress": "progress.json",
    "conventions": []
  },
  "commands": {
    "bdd": "NODE_OPTIONS=\"--import tsx\" npx cucumber-js",
    "unit": "npx vitest run",
    "typecheck": "npx tsc --noEmit",
    "format": null,
    "lint": null,
    "coverage": null,
    "extra_checks": []
  },
  "refactor": {
    "entry": [],
    "detectors": {
      "complexity": { "max_cyclomatic": 10, "max_depth": 4 },
      "duplication": { "min_lines": 6, "min_tokens": 50 },
      "magic_value": { "ignore": [0, 1, -1], "min_string_repeats": 3 }
    }
  },
  "limits": {
    "max_retries": 3,
    "max_inner_iterations": 8,
    "agent_timeout_s": 600,
    "agent_max_turns": 40,
    "command_timeout_s": 600
  },
  "integrity": {
    "forbidden_in_src": ["@ts-ignore", "@ts-expect-error", "process.env.VITEST", "import.meta.vitest", "NODE_ENV === \"test\""],
    "forbidden_in_tests": [".only(", ".skip(", ".todo(", "@ts-ignore", "@ts-expect-error", "readFileSync"]
  },
  "settings": {
    "isolation": "worktree",
    "worktree_dir": "../.oid-worktrees",
    "branch_prefix": "oid/",
    "commit_template": "{type}({scope}): {id} {title}"
  }
}
```

- `paths.source` accepts several roots; `oid init` infers them from `tsconfig.json`'s `include`. `paths.shared` names shared modules.
- `refactor`, `limits`, `integrity` and `settings` are optional; the values above are the defaults. `limits.cost_limit_usd` and `cost_limit_fr_usd` have none.
- `readFileSync` in `forbidden_in_tests` applies only when the path read is in `paths.source`; tests may read fixtures.
- Credentials and models never go here: a `models` key is an error that names `oid setup` (ADR-048).
- **Planned:** Jev's thresholds (`decisions.thresholds`, FR-DEC), the notification command (FR-TUI-06) and the cleanup triggers (`refactor.tidy`, FR-TIDY) will be added with their requirements.

### 16.1. User configuration (`<config dir>/config.json`)

The config dir is `$OID_CONFIG_DIR`, else `$XDG_CONFIG_HOME/oid`, else `~/.config/oid`. `oid setup` writes it; `oid doctor` checks it (ADR-048).

```json
{
  "models": {
    "fast": "<provider/fast model>",
    "default": "<provider/default model>",
    "strong": "<provider/most capable model>",
    "spec": "<provider/model for Phase 0>"
  }
}
```

- Each role is `provider/id`, resolved with Pi's `ModelRuntime`. The `decisions` role is reserved for Jev (FR-DEC).
- Credentials live in `<config dir>/agent/auth.json`, oid's `agentDir` (`OID_AGENT_DIR` overrides it), written through Pi's `ModelRuntime.login`: the provider's own login flow or an API key from standard input. Provider variables (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`…) still work. oid never reads `~/.pi`; `oid setup --import-pi` copies its credentials once, when asked, merging them per provider, atomically and with mode 0600; imported OAuth entries share their refresh token with Pi, and oid says so.

---

## 17. Session state (`.outside-in/session.json`)

What a stopped run needs to resume, and nothing else; the history is in `events.jsonl`. It holds the run's id, its state, its target features and the ones left, the worktree, branch and starting commits, the current feature and scenario with where they started, the unit tests and failures of the inner loop, the attempts used per state with the last reason, skipped scenarios, the approved feature files, the pending question, and the spend so far with any budget extensions. The shape is `RunSession` in `src/orchestrator/session.ts`. It is written atomically after every state (§6.3).

---

## 18. Source layout

| Path | What lives there |
|:--|:--|
| `src/cli.ts` | The only module that reads process globals; compiled to `dist/cli.js` (ADR-028) |
| `src/run-cli.ts`, `src/commands/` | Argument parsing, and one module per command |
| `src/orchestrator/` | The states of `oid run` (`run-*.ts`), gates, questions, budget, session, lock, resume |
| `src/agents/` | Everything that touches Pi: runner, profiles, sandbox, containment, shell floor, tools, context, prompts |
| `src/artifacts/` | `SPEC.md`, Gherkin and progress; checkpoints and integrity; runners and their reports; detectors and metrics; git; configuration |
| `src/events/` | The event bus and its types |
| `src/ui/` | Terminal output |
| `features/` | oid's own scenarios, steps and support (fixtures of run scenarios included) |
| `tests/unit/` | vitest |

---

## 19. Testing oid

Principles, learned through defects that reached production in Buddy:

- **Unit tests with no network**, against fakes with the SDK's real event shapes (`message_end` with `stopReason`, `tool_execution_start/end`), including provider-error and empty-response cases.
- **BDD in-process by default**; only `@process` scenarios launch the built binary (ADR-028). The agents of a run are scripted and the runners replay recorded reports; one real runner per run state (`docs/CONVENTIONS.md`).
- **Test the wiring, not just the policy.** A correct sandbox that is never installed protects nothing: a test checks that every session has the hook installed and that it blocks.
- **Tests cannot reach the network or the real SDK by accident.**
- **SDK compatibility test** on the shapes oid uses, so that an upgrade breaks the suite, not a run (NFR-09).
- **`agentDir` isolation test** on every call to `createAgentSession`.
- **`TOOL_PATH_ARGS` test**: a registered tool with an undeclared path-like parameter fails.
- **Real runs** on oid itself and on a small reference project (the article's URL shortener) catch prompt regressions and feed calibration. Each run records attempts, rejected attempts, blind retries (a retry whose agent was not told what to change), sandbox denials, questions to the human, overrides, cost and time, and, with Jev, the agreement with humans. **Planned (FR-TUI-04):** the final report produces them; today they go to the bootstrap log by hand.
- **One change at a time.** Between measured runs, change only what fixes a known defect, and judge a change by its effect over several runs, not by one success.
- **Per scenario:** unit tests and TDD cycles, to see whether "one test per `TDD_RED`" costs more cycles than it saves (ADR-055).
- **Representative and varied.** The evidence base is a small set of real runs over varied requirements, not more replayed scenarios: almost every defect found late in the bootstrap came from a real run, not from the suite. Scenarios that pin wording or final states make the suite slower and say little.
- oid working on its own repository runs from an installed build, never from the code it changes (ADR-024).

---

## 20. Risks, open checks and known gaps

### 20.1. Risks

| Risk | Mitigation |
|:--|:--|
| Pi's API changes | One exact version; all contact in `src/agents/`; compatibility test (ADR-003). |
| Jev is a young service | Served by several providers through Pi; pinned model; conservative defaults on outages; a local alternative. |
| Wrong Red classification | Deterministic layer first; external decision or Jev for the rest; every decision logged. |
| Over-implementation | Coverage when configured; the definition-of-done warnings; human review of the branch. |
| Secrets reaching a provider | Secret files unreadable by every agent, with no override. |
| A provider error passing for success | `assertProductiveResponse` after every prompt. |
| A tool registered but never offered | One array for `tools` and `customTools`. |
| A static import of missing code stopping cucumber | Loadable-steps rule before every BDD run. |
| Detector false positives | Baseline, `refactor.entry`, and Jev's triage (planned). |
| A refactored test that stops testing | The test guarantee of the meso scale; assertion counting in `oid tidy`. |
| Over-engineering in the name of refactoring | Closed lists, metrics that cannot get worse, two references per new export. |

### 20.2. Open checks

- The `score` scale each classification provider returns (Jev on OpenRouter, `llama-cpp-classify`), for the thresholds of §8.
- Availability and price of `typesafe/jev-1.13` on OpenRouter against `jev-latest` on TypeSafe directly.

### 20.3. Known gaps between this document and the code

Each is a difference to resolve with the human: either the document describes the decision and the code has to follow, or the code has the decision and this document has to change.

- **Working in place** (`settings.isolation: "in_place"`) exists, with scenarios of FR-GIT-01, but contradicts FR-GIT-01's text ("every run works in its own worktree") and NFR-04.
- **Regression in `BDD_CHECK`.** A scenario that was green and turns red ends the run with an error; §6.7 says it fails the attempt, which is retried.
- **Permanent provider errors** end the run with exit 1; the design intended a question to the human.
- **`request_dependency` in `oid run`** has nobody to approve it, so every request is refused.
- **Skipping a scenario** moves the feature on to its next step; §10.1 intended the feature to stay where it was.
- **"Continue" on a red baseline** cannot be completed: the run exits 3 and a start state cannot be resumed.
- **Formatting after each agent session.** The prompts tell the agents that oid formats their code when they finish; oid formats only at the quality gate.
- **Micro refactor acceptance** checks the findings, complexity, the unit suite, types and the current scenario, but not duplicated lines, the two-references rule or the full BDD regression of §6.8.
- **The report against the diff** is checked only in `FEATURE_WRITE`.
- **The test-writing agent** does not receive the names of the existing unit tests.
- **Dead ends still open in `oid verify`** (bootstrap log): a guard scenario fixed after the code exists has no legal return, since it passes without this cycle's code by design; a step of an earlier scenario fixed late is judged against the last scenario's Red and cannot return; a duplication finding in a step definition has no legal move, since a step changes only at `bdd_red` and a return needs a scenario that fails without this cycle's code. **Planned (FR-VERIFY-10):** evidence by mutation (ADR-056).
- **A passing scenario that pins wording has no legal rewrite.** `features/agent-08.feature:138` checks a sentence of the system prompt ("search the reuse catalogue in your task before you write a new function or constant, and reuse what exists") instead of the mechanism (the reuse catalogue reaches the system prompt), against ADR-057. `oid progress scenario drop` removes only pending scenarios (FR-PROG-05) and a reopen keeps passing ones (ADR-040); after a revise, the rewritten scenario passes at once with the current code, so no Red is possible, and the ADR-041 exit does not apply because the text changes, not only moves. **Planned (FR-VERIFY-10):** evidence by mutation, with the human's approval, since it changes an approved scenario; FR-VERIFY-10 comes before the `tune(prompts)` of the coding agent's prompt, the only change that would touch that sentence.
