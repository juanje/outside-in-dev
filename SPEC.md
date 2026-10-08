# oid — Specification

`oid` (Outside-In Development) is a command-line harness that enforces the Outside-In Development methodology (Spec → BDD → TDD) on AI coding agents. The methodology is not an instruction the agent may follow; it is the control flow. A deterministic state machine decides what happens next, ephemeral agents built on the Pi SDK write specs, tests and code under file-system restrictions, and a decision model (Jev, through Pi's classifier API) answers the semantic micro-questions that code cannot.

Methodology reference: [Outside-In Development: Spec → BDD → TDD for AI Coding Agents](https://ai.juanjeojeda.com/outside-in-development).
Domain context: `DOMAIN.md`. Architectural rationale: `DECISIONS.md`. Full technical design: `docs/design.md`.

## Goal

A developer describes what to build in `SPEC.md`, reviews the acceptance scenarios once, and gets back a branch with one clean commit per feature, where every behaviour is traced to a scenario, every scenario to a requirement, and every step of the cycle was verified by running something rather than by the agent saying so. The code must not drift: duplication, complexity, dead code and stale documentation are detected and cleaned as part of the cycle, not left for occasional manual sweeps.

## MVP

The MVP is usable on real TypeScript projects (oid itself and Buddy) for adding features to an existing codebase:

- Progress tracking and consistency checks usable on their own, by humans and by prompt-driven agents.
- Project setup, including importing progress from projects that followed an earlier version of the methodology.
- The full `new-feature` cycle: feature files with human review, BDD Red, TDD Red/Green, refactor, quality gate, one commit per feature.
- Refactor guided by deterministic detectors at three scales (after each Green, per feature, and periodic `oid tidy`), with code-health metrics.
- Decisions through Jev with deterministic layers first and conservative fallbacks.
- A modern terminal interface: a progress view that switches to a conversation when a human is needed.
- The interactive design phase (`oid spec`) for adding requirements.

Its behavioural constraints are part of the MVP, not extras: only the agents that implement or debug have a shell, contained in the run's worktree; no agent can read secrets, touch the user's working copy or main branch, or report success without evidence; and only the orchestrator decides Red, Green and when the cycle moves on.

## Not in scope

- The `fix-bug` and `new-project` workflows (designed; built after the MVP).
- The Python stack (designed; built after the MVP).
- The web dashboard (built after the MVP, as another view over the same events).
- Running in CI, remotely or for several users.
- Merging into the main branch. `oid` delivers a branch; merging is a human decision.
- Replacing human judgement in the design phase, which is always interactive.
- Calibrating a local decision model. Pi supports one with the same API; the MVP uses Jev.



## Stack and tools

- **oid itself:** TypeScript on Node.js ≥ 22.19. Pi 1.0.3 (`@earendil-works/pi-coding-agent`, `pi-ai`, `pi-agent-core`, `pi-tui`), pinned. Jev through Pi's `classify()`, model `typesafe/jev-1.13` on OpenRouter.
- **oid's own tests:** vitest (unit), cucumber-js 13 with tsx (BDD), `tsc --noEmit` (types).
- **Target projects in the MVP:** TypeScript with vitest and cucumber-js. Detectors bundled with oid: `knip`, `jscpd`, and analyses built on the TypeScript compiler API.
- **Distribution:** npm package `outside-in-dev`, command `oid`.

---



## Functional Requirements — Progress



### FR-PROG-01: Show progress

`oid progress current`, `status` and `show FR-xxx` print the focused feature, an overview of the tracked features, or one feature with its scenarios. Every session, human or agent, starts by knowing where the work is without reading code or git history.

### FR-PROG-02: Add a feature

`oid progress add FR-xxx "Title"` adds a pending feature, refusing IDs that are already tracked or that do not exist in `SPEC.md`. Progress can only refer to requirements that are specified.

### FR-PROG-03: Focus a feature

`oid progress focus FR-xxx` sets the current focus, and `oid progress unfocus` clears it, also when it points to a feature that is already done. The focus is what an agent works on when no feature is named, so it must always point to a tracked feature.

### FR-PROG-04: Advance the cycle step

`oid progress step FR-xxx <cycle_step>` moves a feature to another step of the cycle and rejects any transition that the two loops of the methodology do not allow. From `quality_gate` a feature can only go back to `bdd_red` or `tdd_red`: a gap seen at the gate becomes a new Red. Skipping steps is the most common silent failure of prompt-driven agents.

### FR-PROG-05: Record scenario status

`oid progress scenario pass|fail|pending FR-xxx "Scenario name"` records the BDD status of a scenario, creating it if needed. `oid progress scenario drop FR-xxx "Scenario name"` removes a scenario that is pending; one in pass or fail is never dropped, and the file is left unchanged. Scenario state is what makes "done" checkable.

### FR-PROG-06: Mark a feature done

`oid progress done FR-xxx` marks a feature done only if it has at least one scenario and every scenario passes. The rule cannot be overridden from the command line.

### FR-PROG-07: Reject an invalid progress file

Every command validates `progress.json` against its schema before and after writing, refuses unknown fields and reports the exact violation. Free-form notes in the progress file degrade it within a few sessions; the schema is what prevents that.

### FR-PROG-08: Revise a requirement

`oid progress revise FR-xxx` puts a tracked feature back to `in_progress` at `bdd_red` and sets every scenario to `pending`. It does not edit `SPEC.md` or the feature file. A feature that is not tracked is refused; one already at `bdd_red` is left as it is. It is not `oid progress step`: that one keeps the scenarios, and a `done` feature cannot use it. When a requirement changes, its scenarios no longer prove the new contract, and adding a second FR for the same intent leaves two truths in the spec.

### FR-PROG-09: Reopen a done feature for review

`oid progress reopen FR-xxx` puts a `done` feature back to `in_progress` at `quality_gate` and leaves every scenario's status as it is. It does not edit `SPEC.md` or the feature file. A feature that is not `done` is refused, so it is never a shortcut to `quality_gate`. When the focused feature is `done`, `oid verify integrity` names `oid progress reopen` for a review and `oid progress revise` for a changed requirement. A pull request opens with the feature already `done`; review comments must be fixable without resetting scenarios that still pass.

## Functional Requirements — Consistency checks



### FR-CHECK-01: Validate [SPEC.md](http://SPEC.md)

`oid check` reports requirements with duplicate IDs, empty titles or bodies, and acceptance criteria written inside a requirement (a Gherkin-style sequence: a `Given` step followed by a `Then` step, or a `Scenario:` line), without flagging ordinary sentences that happen to start with those words. Acceptance criteria belong to feature files; a specification that mixes both loses its role as the statement of intent.

### FR-CHECK-02: Check scenario traceability

`oid check` reports scenarios without an `@FR-` tag, and tags that point to requirements or NFRs missing from `SPEC.md`. Tags inherited from the `Feature` count. Every scenario must trace to a requirement.

### FR-CHECK-03: Check progress consistency

`oid check` reports progress that contradicts the other artefacts: a focus on a feature that is not in progress, a done feature with failing scenarios, a started feature without feature files, scenarios in progress that no feature file contains.

### FR-CHECK-04: Machine-readable results

`oid check` exits non-zero on any violation and offers JSON output, so it can run in the test suite, in a pre-commit hook and in agent hooks.

## Functional Requirements — Command line



### FR-CLI-01: Command help

`oid --help`, `oid <command> --help` and `oid <command> <subcommand> --help` print what the command does, its subcommands, arguments and options, and exit 0; `oid` with no command prints the same help as `oid --help` and exits 0. Anyone running oid, human or agent, can learn how to use it without triggering an error.

### FR-CLI-02: Concise status

`oid progress status` lists the features that are not done, marks the focused one and ends with the number of done features; `oid progress status --all` lists every tracked feature. The progress of a long project stays readable at a glance.

### FR-CLI-03: Show the version

`oid --version` and `oid -v` print `oid <version>`, the version of the installed package, and exit 0; `oid --help` lists the option. Anyone reporting a problem, human or agent, can tell which build is running.

## Functional Requirements — Project setup



### FR-INIT-01: Detect the project setup

`oid init` detects the stack, source and test paths, test commands and existing formatter or linter from `package.json`, `tsconfig.json` and the vitest and cucumber configuration, writes `.outside-in.json`, and adds `.outside-in/` to `.gitignore`. A user should not have to describe a project that can be read.

### FR-INIT-02: Initialise progress from [SPEC.md](http://SPEC.md)

If no progress file exists, `oid init` creates one with every requirement in `SPEC.md` as a pending feature, in the order of the specification.

### FR-INIT-03: Import progress from another schema

`oid init --import-progress` converts a progress file written for an earlier version of the methodology (such as Buddy's) to the current schema and lists what could not be carried over. Projects that already follow the methodology can adopt oid without losing their state.

## Functional Requirements — Code health



### FR-MET-01: Detect complexity

Report functions whose cyclomatic complexity or nesting depth exceeds the configured limits, with file, range and symbol.

### FR-MET-02: Detect duplication

Report duplicated blocks, including across files, with both locations. Duplication between features is the main source of drift in agent-written code.

### FR-MET-03: Detect dead code

Report unused exports, files and dependencies, unused locals and commented-out code.

### FR-MET-04: Detect magic values

Report numeric literals and repeated strings that should be named constants, excluding trivial values and test files.

### FR-MET-05: Detect documentation drift

Report JSDoc whose parameters do not match the signature, and documentation in `README.md` and `docs/` that names functions, types or modules that no longer exist.

### FR-MET-06: Record and show code health

`oid metrics` records a snapshot of duplication, complexity, dead code, magic values and documentation drift, and shows the trend over time; `oid metrics --changed` limits the findings to the lines changed since the last commit or checkpoint. Drift becomes visible per feature instead of being noticed every few sprints.

### FR-MET-07: Separate existing debt from new findings

Findings present when a run starts are recorded as a baseline; checks then judge only what the run introduces. Existing projects must be usable without first cleaning all their debt, and the gates must still mean something.

## Functional Requirements — Verification



### FR-VERIFY-01: Verify a unit Red

`oid verify red <test>` runs a unit test and classifies its failure as a valid Red (a business assertion, or behaviour that does not exist yet) or not (a broken test, a problem in the environment), using the runner's structured report and the project's actual exports. A test that passes, does not load, or calls something wrongly is not a Red. A failing assertion on a line of a test added since the last checkpoint is a valid Red; one on a line that already existed needs a decision (ADR-033). A failure oid cannot classify alone is recorded with the content of the working tree it ran on; `--decide <class>` answers that recorded failure without running the test again, and is refused when no recorded run of the target needs a decision or when a file other than the progress file changed since it.

### FR-VERIFY-02: Verify a BDD Red

`oid verify red <feature>:<line>` (or `oid verify red "<scenario name>"`, when one scenario has that name) does the same for a scenario. Undefined, pending or ambiguous steps are not Red: the steps must run and fail. `--decide` answers the recorded failure of the scenario in the same way.

### FR-VERIFY-03: Check that steps load

Reject step files that statically import modules or exports that do not exist yet, with the exact imports to change. A single such import prevents the BDD runner from starting at all, which hides every other scenario.

### FR-VERIFY-04: Verify a Green without regressions

`oid verify green [<feature>:<line> | "<scenario name>"]...` runs the unit suite, the scenarios that were passing of the features it verifies (the feature in focus and the feature of each scenario it is given) and the scenarios it is given, in one run, and reports any regression among them and any new type error in source code. The scenarios of other features are not run: the regression of the whole project is the quality gate's. Every verification that passes records the checkpoint of the feature it verifies, one per feature (`.outside-in/checkpoints/<id>.json`): a green records it for the feature in focus and for the feature of each scenario it was asked to run, and never replaces the checkpoint of another feature; with no feature at all it records the single checkpoint `.outside-in/checkpoint.json`. Scenario evidence (`oid progress scenario pass`, `oid progress done`) is read from the checkpoint of the feature it is about.

### FR-VERIFY-05: Check the integrity of a change

`oid verify integrity` reports changes, since the checkpoint of the feature in focus, outside the paths allowed for the current step (source changed while writing tests, tests changed while writing code, approved feature files modified) and forbidden patterns in added lines, such as focused or skipped tests, type-check suppressions, or code that behaves differently under test. A feature with no checkpoint of its own is judged against the single checkpoint when that names it.

### FR-VERIFY-06: Fix a step after the code exists

A step definition found wrong at `tdd_red`, `tdd_green` or `refactor` is fixed by going back to `bdd_red`, never in place. Going back records where the feature came from and the content of the tree; until it leaves, `src/` must stay as it was. `oid verify red` on the scenario then returns the feature to the step it came from only if the scenario passes, `src/` has not changed since going back, and the scenario fails when oid removes the code written in this cycle, which it restores afterwards. When this cycle has no code yet, the feature moves to `tdd_red` if `src/` has not changed since going back and the scenario either fails as a valid Red or already passes: the unit test is still needed, and the feature never skips to `tdd_green`. The move from `tdd_red` back to `bdd_red` is allowed, like any return to a Red; there is no manual move from `bdd_red` to `tdd_green` or `refactor`. At `bdd_red` without a return, a scenario that already passes and is recorded as passing with the evidence of an earlier green (for example, after the quality gate found a regression) also moves the feature to `tdd_red`; a scenario with no such evidence that passes at once is still not a Red.

## Functional Requirements — Git isolation



### FR-GIT-01: Work in an isolated worktree

Every run works in its own git worktree and branch, so the user can keep working in their copy and a rollback can never delete their changes. Dependencies are shared with the main copy while they do not change.

### FR-GIT-02: Checkpoint and roll back

Every step that passes its gate creates a checkpoint; a failed attempt returns to the last one, removing untracked files in the paths the step could write. Reverting costs no tokens and leaves no residue.

### FR-GIT-03: One commit per feature

Once a feature is done, its checkpoints are squashed into one commit that references the requirement and lists its scenarios. The main branch is never modified.

## Functional Requirements — Agents



### FR-AGENT-01: Isolated agent sessions

Every task runs in a new Pi session with oid's own agent directory and system prompt, without the user's Pi settings, skills or context files. A user's personal configuration must not change what the harness does.

### FR-AGENT-02: Tools and paths per step

Each step grants a fixed set of tools and a set of readable and writable paths; any other access is blocked before it happens and reported to the agent. Only the steps that implement or debug include a shell, and its commands are contained in the run's worktree and cannot change the files only the orchestrator writes; every other step has none. Repeated violations end the session.

### FR-AGENT-03: Secrets are never readable

Files matching the secret patterns (environment files, keys, credential stores, the user's SSH, AWS and GnuPG directories) cannot be read by any agent, with no override. Their content must never reach a model provider.

### FR-AGENT-04: Completion report

Every agent ends by calling a report tool that states whether it finished or is blocked (a specification conflict, a gap, something it cannot test) and which files it changed. Without a report, the attempt fails; the report is checked against the actual diff.

### FR-AGENT-05: Detect provider failures

An agent turn that ended in a provider error or produced nothing counts as a failure, never as success. Transient errors are retried without consuming a methodology attempt; authentication and quota errors stop and ask.

### FR-AGENT-06: Hints after a failed edit

If an edit fails because its anchor text does not match, is not unique or changes nothing, the error returned to the agent includes a specific hint. Most wasted attempts start with a failed edit.

### FR-AGENT-07: Request a dependency

Agents cannot edit `package.json` or lockfiles; they ask for a package with a reason, and the orchestrator installs it after approval (asking by default).

### FR-AGENT-08: Context per task

Each task receives only what it needs: the scenario and failure for a test, the failing tests and the code they import for an implementation. Implementation tasks also receive a catalogue of the project's exported symbols, so that agents reuse existing code instead of rewriting it.

### FR-AGENT-09: A test task receives public signatures

A test task (BDD_RED or TDD_RED) receives the public signatures of the project's exported symbols: the name, the types and the first documentation line, and no body. It still receives no other scenario.

## Functional Requirements — Feature cycle



### FR-RUN-01: Start a run

`oid run` acquires a lock, prepares the worktree, runs the existing suite and records the baseline, validates the target requirements and selects the next pending feature (or those named). A red suite at start stops and asks: an inherited failure cannot be told apart from a new one.

### FR-RUN-02: Write and review feature files

An agent writes the feature files for the requirement; a human approves, edits or rejects them with a comment, by default once for all target features at the start. After approval, the run continues unattended.

### FR-RUN-03: BDD Red

An agent writes the step definitions for one scenario; the scenario must load and fail validly while every passing scenario still passes. Approved feature files cannot change.

### FR-RUN-04: TDD inner loop

An agent writes one failing unit test, then another agent writes the minimum code to make it pass, until the scenario passes. Every scenario needs at least one unit test. The loop has an iteration limit.

### FR-RUN-05: Refactor after each Green

After each Green, detectors run on the lines just changed; if anything worth fixing remains after triage, an agent fixes exactly that list. The result is accepted only if behaviour is unchanged, the findings are gone, nothing new appears and no metric gets worse; otherwise it is rolled back.

### FR-RUN-06: Quality gate

Before committing a feature, the project's formatter and linter fixes run, then format, lint, types, unit tests, BDD, extra checks and traceability must all pass. Fixable lint and type errors go to the agent that owns the file.

### FR-RUN-07: Commit the feature

A finished feature is squashed into one commit and marked done in the progress file; the run continues with the next feature.

### FR-RUN-08: Retries and escalation

A failed attempt is retried from the last checkpoint with the reason, and each retry raises the reasoning level, the last one with the strongest model. When retries run out, the run asks.

### FR-RUN-09: Resume, abort and concurrency

Only one run per repository. `oid resume` continues from the last checkpoint after a crash or interruption; `oid abort` stops after the current step. Every state can be re-executed from its checkpoint.

### FR-RUN-10: Budget

Limits on time, turns, iterations and cost are checked before each billable call. Reaching one stops and asks.

## Functional Requirements — Terminal interface



### FR-TUI-01: Progress view

While the cycle runs, a compact view updates in place: feature, state, active agent and the file it touches, scenarios, latest decisions, cost and a code-health line. Details (traces, diffs, agent transcripts) open on demand.

### FR-TUI-02: Decision cards and feature review

If the run needs a human, the progress view gives way to a card with the context and the available actions, or to the feature files with their scores for review. The answer returns the run to the progress view.

### FR-TUI-03: Plain output without a terminal

Without a TTY, the same information is printed as one line per event; a pending question saves the session and exits with a dedicated code.

### FR-TUI-04: Final report

At the end of a run, a report summarises features, scenarios, refactor findings, code-health trend, human interventions, retries, cost and the resulting branch.

## Functional Requirements — Decisions



### FR-DEC-01: Decisions through the classifier

Ambiguous Red failures, test quality, task complexity, specification ambiguity, feature coverage and finding triage are decided by Jev through Pi's classifier API, after every deterministic layer, with configurable thresholds. Code decides first; the model only answers what code cannot.

### FR-DEC-02: Conservative fallback

If the decision model fails or times out, each decision point applies its conservative default and the run continues. A provider outage must not stop the cycle or lower its standards.

### FR-DEC-03: Decision history

Every decision is logged with its full probabilities and, when it escalated to a human, the human's answer; `oid decisions` shows the agreement between the model and humans per decision point. Thresholds are calibrated with data.

### FR-DEC-04: Detect a stuck loop

If the last attempts fail for the same root cause, the run asks for help instead of spending the remaining retries.

## Functional Requirements — Feature refactor



### FR-REF-01: Refactor the whole feature

Once all scenarios of a feature pass, detectors run on the feature's full diff, including tests, steps and documentation, and on duplication between the feature and the rest of the code. Each group of findings becomes an item fixed by the agent that owns the files; failed items are rolled back and reported.

### FR-REF-02: Refactored tests keep testing

A refactored test that the feature added must still fail against the code from before the feature, and earlier tests must still pass there. A simplified test that stops failing has stopped testing.

### FR-REF-03: Triage findings

Detector findings are filtered by the decision model before any agent works on them, so that conventional or intentional patterns are not "fixed" into worse code.

## Functional Requirements — Terminal interface, extended



### FR-TUI-05: Talk it through

For problems that merit discussion (an ambiguous or contradictory specification, a stuck loop), the card offers a conversation with an agent that has the problem's context, can edit only the specification when relevant, and ends by choosing one of the actions the run offers.

### FR-TUI-06: Notifications

A configurable command runs whenever the run needs a human, finishes or fails, so unattended runs can notify the user.

### FR-TUI-07: Watch a run

`oid watch` shows the progress view of a run from another terminal, or replays a finished run from its event log.

## Functional Requirements — Design phase



### FR-SPEC-01: Interactive design session

`oid spec` opens a conversation with a design agent, in Pi's interactive interface, that can read the repository and write only the design documents. The design phase is always interactive and runs in its own context.

### FR-SPEC-02: Design readiness check

A `/check` command inside the session, and the exit of the session, report what the design documents still lack: format violations, and gaps in goal, MVP, scope, cross-cutting rules, domain and stack. Leaving requires explicit human confirmation.

### FR-SPEC-03: Register new requirements

On confirmation, new requirements are added to the progress file as pending and the design documents are committed to the user's current branch, the only commit oid makes outside its own branches.

## Functional Requirements — Periodic cleanup



### FR-TIDY-01: Analyse and plan a cleanup

`oid tidy` runs the detectors on the whole project, including existing debt, triages the findings and plans small, independent items, each with its findings, files and type.

### FR-TIDY-02: Review the cleanup plan

The human approves, removes or reorders items before anything changes.

### FR-TIDY-03: Apply cleanup items

Each approved item is applied by the agent that owns its files, verified with the refactor acceptance rules and committed on its own; tests touched by an item must keep their identities and their number of assertions. Failed items are rolled back and reported.

### FR-TIDY-04: Propose a cleanup

At the end of a run, oid proposes `oid tidy` when a configured number of features has passed since the last cleanup or a health metric has worsened beyond its threshold. It never starts one on its own.

---



## Non-Functional Requirements



### NFR-01: Deterministic first

Every decision is attempted first by deterministic means (parsers, exit codes, structured runner reports, the compiler, git), then by the decision model, and only then by a generative model.

### NFR-02: Only the orchestrator verifies

Only the agents that implement or debug have a shell, so they can run a command and read its output while they work. Their shell is contained: it runs inside the run's worktree and cannot change the files only the orchestrator writes (`progress.json`, `.outside-in/`, the git state of the run); every other agent has none. Whatever an agent runs is feedback for its attempt. Red, Green and moving the cycle on are decided by the orchestrator alone, from its own runs of the tests, linters and type check, so every verification is empirical and never self-reported. Git and package management stay with the orchestrator.

### NFR-03: Evidence over reports

A finished session, a resolved promise or an agent's claim of success is not evidence. Only artefacts are: the test that ran, the diff, the exit code.

### NFR-04: The user's work is never at risk

oid never writes to the user's working copy (except the explicit design commit of `oid spec`) and never modifies the main branch.

### NFR-05: Secrets never leave the machine

Secret files are unreadable by agents and their content is never sent to a model provider.

### NFR-06: Resumable at every step

Every state is re-executable from its last checkpoint, and state files are written atomically.

### NFR-07: Structured runner output only

Test results are read from structured reports (Cucumber Messages, vitest JSON), never from terminal text.

### NFR-08: Everything is logged

Every transition, decision, agent session, test run, checkpoint and human answer is written to an append-only event log, with or without an interface attached.

### NFR-09: Pinned external behaviour

Pi and the decision model are pinned to exact versions; a compatibility test fails when an upgrade changes any shape oid relies on.

### NFR-10: Isolation from user configuration

Agent sessions never read the user's global Pi settings, skills or context files.

### NFR-11: Agent-facing text in English

Prompts and agent-facing documents are written in English without examples in other languages. Generated artefacts use the configured language; test data may use the end user's language.

### NFR-12: Costs are bounded

Budgets are checked before each billable call, not only at the start of a run.