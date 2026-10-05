# Architecture decisions

Each entry records the context, the options considered, the decision and its consequences. Settled decisions are not revisited without a new entry that supersedes them. Status: **accepted** unless stated otherwise.

Full technical design: `docs/design.md` (section numbers below, as §n, refer to it).

---

## ADR-001: Enforce the methodology by architecture, not by instruction

**Context.** Prompt-driven agents following `AGENTS.md` skip steps, adapt tests to code and drift as conversations grow. Experience with Buddy showed that several defects were already forbidden in a prompt: the instruction did not fail, it simply did not apply, because the failure needed no disobedience.
**Options.** Better prompts and rules files; hooks around an existing agent; a harness that owns the control flow.
**Decision.** A deterministic state machine owns the cycle. Agents execute single tasks and return control; they never decide which step comes next.
**Consequences.** The cycle cannot be skipped. oid has to implement every gate, rollback and transition itself, and is more code than a rules file.

## ADR-002: Embed the Pi SDK instead of driving an agent CLI

**Context.** Agents need coding tools (read, edit, write, search) without oid reimplementing them, and oid needs control over each session.
**Options.** Build the agent loop on a raw LLM SDK; drive Pi through its CLI or RPC mode; use a subagents extension inside a Pi session; embed `createAgentSession()`.
**Decision.** Embed the Pi SDK in-process and use its built-in tools, wrapped by oid's sandbox. Pi is not the parent: oid's state machine is.
**Consequences.** Mature tools, sessions and streaming for free. oid depends on Pi's API and must isolate it (`agents/runner.ts`) and test its shapes (ADR-003).

## ADR-003: Pin Pi 1.0.3

**Context.** The patterns were learned on Pi 0.84. Buddy's lockfile now resolves `@earendil-works/pi-coding-agent` to 1.0.1, and that tree already passes an explicit `agentDir`, returns `{ block: true, reason }` from `beforeToolCall`, builds `tools` and `customTools` from one array, and calls `session.abort()`. Pi 1.0.0 (October 2026) adds the classifier API used for Jev. All APIs oid relies on were checked in the `v1.0.0` tag: `agent.beforeToolCall`/`afterToolCall`, `DefaultResourceLoader` with `systemPromptOverride`, `excludeTools`, `SessionManager`, `session.abort()`, thinking levels, `tool_execution_*` events, `createAgentSessionRuntime`, `InteractiveMode`, `ModelRuntime.classify()`. The current stable of that line is 1.0.3, on all four packages. What 1.0.1 does not answer, and spike S1 still has to, is a bad API key surfacing as `stopReason: "error"` from `prompt()` and `classify()`, and `SessionManager.create(cwd, dir)` plus `session.abort()` still matching that usage on 1.0.3.
**Decision.** Pin exact versions of `pi-coding-agent`, `pi-ai`, `pi-agent-core` and `pi-tui` at 1.0.3. A compatibility test checks every shape oid uses.
**Consequences.** Upgrades are deliberate and break the test suite, not a run. S1 does not re-prove isolation or the tool allowlist; Buddy 1.0.1 already did, including the two leaks that came from an SDK default (`modelsPath`, a session directory omitted on `SessionManager.create`). Detail in `docs/BOOTSTRAP.md`, Phase 1.

## ADR-004: Jev through Pi's classifier API, behind a thin adapter

**Context.** Micro-decisions (is this failure a valid Red? is this finding worth fixing?) are too fuzzy for code and too small for a reasoning model. Jev returns typed decisions with calibrated probabilities in about 200 ms. Pi 1.0 exposes classifier models through `classify()` with the same credentials, cost accounting and error handling as chat models.
**Options.** TypeSafe's SDK directly; an LLM with structured output; Pi's `classify()`.
**Decision.** `PiClassifierAdapter` over `modelRuntime.classify()`, behind oid's own `DecisionAdapter` interface. Default model `typesafe/jev-1.13` on OpenRouter, because it is versioned; TypeSafe's direct catalogue only lists `jev-latest`. Pi's `bool` questions are Jev's `noul`.
**Consequences.** No second client. A local model (`llama-cpp-classify`) can replace Jev with no new code, only calibration. `classify()` never rejects: errors arrive as `stopReason: "error"` and must be checked.

## ADR-005: Agents never run commands

**Context.** Pi has no permission system for processes. A shell lets an agent run tests and report their result, edit any file, or work around the sandbox.
**Decision.** No agent has `bash` (excluded and absent from the allowlist). The orchestrator runs tests, linters, git and package management.
**Consequences.** Every verification is empirical. Agents cannot add dependencies themselves, so a `request_dependency` tool exists (§7.7).

## ADR-006: Sandbox with `beforeToolCall` and a single containment authority

**Context.** Each step may read and write different paths. String comparison of paths is unsafe (`features/../.git/config`, symlinks). Buddy had the same rule written in four places that disagreed.
**Decision.** A chained `session.agent.beforeToolCall` hook blocks calls by state profile. Paths are checked by one module that resolves symlinks on both sides and the nearest existing ancestor for new files. A table declares which arguments of each tool are paths, and a test fails if a registered tool has an undeclared path-shaped argument. In the design phase, where Pi can replace the session, the sandbox is installed as an extension (`tool_call`) instead.
**Consequences.** Adding a tool cannot silently bypass the sandbox. A second line of defence (git diff integrity, ADR-016) does not depend on the sandbox working.

## ADR-007: One array for `tools` and `customTools`

**Context.** `createAgentSession` takes an allowlist of names and a list of custom tool definitions; a tool present in one and missing from the other is never offered to the model, with no error.
**Decision.** Both lists are derived from one array.
**Consequences.** The failure mode cannot occur by construction.

## ADR-008: oid's own agent directory and system prompt

**Context.** Without an explicit `agentDir`, Pi's settings manager reads the user's `~/.pi/agent/settings.json` (provider, model, thinking level, theme), and the default resource loader discovers the user's skills and context files.
**Decision.** Every session uses `~/.config/oid/agent` (or `$OID_AGENT_DIR`) and a `systemPromptOverride`. A test checks every call to `createAgentSession`.
**Consequences.** Runs are reproducible across machines. Credentials live in oid's agent directory; `oid doctor` offers a one-time explicit import from Pi's.

## ADR-009: Ephemeral sessions, persisted transcripts

**Context.** Context isolation needs a fresh session per task; debugging needs to see what an agent did.
**Decision.** A new session per task with `SessionManager.create()` in the run's folder, not in memory.
**Consequences.** No context leaks between tasks; every transcript can be opened from the interface.

## ADR-010: Worktree, checkpoints and one commit per feature

**Context.** `git checkout -- .` (the first design) does not remove untracked files and reverts to the last commit, losing earlier good steps. Rolling back in the user's working copy can destroy their changes.
**Options.** Work in place; a branch per feature; a worktree per run with checkpoints.
**Decision.** Each run works in its own worktree and branch. Every passed gate is a checkpoint commit; rollback is `reset --hard` to it plus `clean` in the step's writable paths. Each feature is squashed into one commit. The main branch is never touched.
**Consequences.** Clean history and safe rollbacks; the user merges the branch. Each worktree needs dependencies (ADR-019).

## ADR-011: The article is the only reference for the methodology's artefacts

**Context.** Buddy started before the methodology was settled, and part of the article was learned from its mistakes. Its `SPEC.md` and `progress.json` differ from the article.
**Decision.** `SPEC.md`, feature files and `progress.json` follow the article exactly. Buddy is a reference for engineering (Pi usage, testing lessons), not for artefacts. Projects with an older progress schema are converted once (`oid init --import-progress`).
**Consequences.** One format to parse and validate. Older requirements in such projects become frozen debt (ADR-021).

## ADR-012: `progress.json` and `session.json` are different things

**Context.** The methodology's progress record and the harness's execution state were mixed in the first design.
**Decision.** `progress.json` (article schema, versioned, no extra fields) records where the methodology is. `.outside-in/session.json` (ignored by git) records what oid needs to resume. Anything oid needs beyond the article's schema goes to the session or the event log.
**Consequences.** The progress file stays useful without oid and cannot degrade into notes.

## ADR-013: Feature files are reviewed by a human, once, up front

**Context.** Acceptance scenarios define what gets built; a wrong scenario is built precisely. Reviewing per feature interrupts unattended runs.
**Decision.** By default, feature files for all target requirements are written and reviewed at the start of a run; after approval the run is unattended. Per-feature review and no review are options.
**Consequences.** One interruption per run in the common case.

## ADR-014: Terminal interface in the MVP, web dashboard later

**Context.** A web dashboard is useful for watching from another device, but the MVP must work end to end first, and interaction moments (design, reviews, decisions) feel best as a modern terminal chat.
**Decision.** The MVP has a terminal interface built on `pi-tui` and Pi's exported chat components: a progress view that becomes a conversation when a human is needed. All events go to `events.jsonl`, so a web dashboard can be added later as another view.
**Consequences.** No server in the MVP. The interface holds no state the orchestrator needs.

## ADR-015: Design phase in Pi's interactive mode, in a child process

**Context.** The design phase is a free conversation and benefits from a full chat interface. `InteractiveMode` is exported and accepts a custom runtime, but calls `process.exit` when the user leaves.
**Decision.** `oid spec` runs `InteractiveMode` with oid's design-agent runtime in a child process; the parent runs the exit gate when it ends.
**Consequences.** A complete chat experience for free; leaving the chat cannot kill oid.

## ADR-016: Two lines against test cheating

**Context.** An agent that can edit tests and code tends to fit tests to code.
**Decision.** Writable paths depend on the step (sandbox), and after every session the diff is checked: allowed paths, approved feature files unchanged, forbidden patterns in added lines (`.only(`, `.skip(`, `@ts-ignore`, `process.env.VITEST`…).
**Consequences.** A violation is rolled back even if the sandbox failed.

## ADR-017: Layered Red gate with `missing_implementation`

**Context.** In TDD the most common Red is that the function does not exist yet. In vitest a missing export arrives as `undefined` and fails as `TypeError: (0 , name) is not a function`; a missing module fails the file load. Treating these as broken tests blocks the cycle; treating every runtime error as Red lets broken tests through.
**Decision.** Exit code, then deterministic classification of the structured report, resolving missing names against the project's real exports, then Jev for what remains ambiguous, then a threshold with a conservative default.
**Consequences.** Most Reds are classified without a model.

## ADR-018: Structured runner output, and loadable step files

**Context.** cucumber-js 13 no longer ships `json` or `junit` formatters; its structured output is Cucumber Messages (`--format message`). A step file that statically imports a module or export that does not exist makes cucumber-js exit before running anything and without writing a report.
**Decision.** Read Cucumber Messages and vitest's JSON report only. Before running BDD, check that changed step files only import existing source statically; anything not yet implemented is imported dynamically inside the step.
**Consequences.** Red in BDD appears at runtime as `Cannot find module`, and the rest of the suite keeps running.

## ADR-019: TypeScript first

**Context.** The first projects to use oid are oid itself and Buddy, both TypeScript. Dogfooding early gives real feedback.
**Decision.** The MVP supports TypeScript with vitest, cucumber-js and `tsc`. Python follows after the MVP with the same adapter interface. Code analysis runs in-process with the TypeScript compiler API. Worktrees link `node_modules` from the main copy while dependencies do not change.
**Consequences.** One stack to get right first. The adapter interface must stay stack-neutral.

## ADR-020: Refactor guided by detectors, at three scales

**Context.** TDD includes refactoring, but in practice it does not happen: nothing signals it, its scope is too local to see duplication between features, and context isolation makes agents rewrite code that already exists elsewhere. The developer ends up asking for cleanups every few sprints.
**Options.** A refactor step gated by a vague model question (previous design); periodic manual requests; deterministic detectors with closed work lists.
**Decision.** Detectors (complexity, duplication, dead code, magic values, documentation drift) produce findings; Jev filters false positives; agents fix exactly the listed findings. Three scales: after each Green, per feature (tests and docs included), and `oid tidy` for the whole project. A change is accepted only if behaviour is unchanged, the findings are gone, nothing new appears, no metric gets worse and every new exported symbol has two references. A catalogue of existing exports in the implementation context prevents duplication at the source. Code-health metrics are recorded per feature.
**Consequences.** Refactor has a signal, a scope and a stopping condition, and over-engineering is rejected by the same rules. Detectors add a small deterministic cost to every cycle; agents only run when there are findings.

## ADR-021: Frozen baseline for existing debt

**Context.** Real repositories start with type errors, lint warnings, detector findings and traceability gaps unrelated to the feature at hand.
**Decision.** Existing debt is recorded at the start of a run and gates judge only what the run introduces. Red tests are not frozen: a red suite at start asks the human.
**Consequences.** oid is usable on existing projects; `oid tidy` is where old debt is paid.

## ADR-022: Decision-model checks on the definition of done are informational

**Context.** Probabilistic answers to "is there dead code?" or "is this out of scope?" are too fuzzy to block a commit.
**Decision.** They produce warnings in the report and the commit body; deterministic detectors are what blocks.
**Consequences.** No false blocks from a fuzzy model.

## ADR-023: Name `oid`, package `outside-in-dev`

**Context.** `oi` is too short and generic for a command. The methodology must be distinguished from Outside-In TDD (Freeman and Pryce).
**Decision.** Command `oid`, npm package `outside-in-dev`. The target project's files keep descriptive names: `.outside-in.json`, `.outside-in/`.
**Consequences.** "OID" is also a common term (git object IDs, SNMP/LDAP, PostgreSQL), which makes web searches noisy; acceptable for a niche tool.

## ADR-024: Bootstrap with prompt-driven development and incremental dogfooding

**Context.** oid should be built with its own methodology and used on itself as early as possible, but it does not exist yet. A separate proof of concept of prompt-driven methodology would repeat what Buddy already proved. The real unknowns are technical: the Pi sandbox, Jev on real traces, `pi-tui`.
**Decision.** Build oid with Claude Code following the methodology through `AGENTS.md`, after time-boxed spikes for the technical unknowns. Order the requirements so that each deterministic piece replaces a manual part of the process as soon as it exists (progress, checks, metrics, Red/Green verification). Switch to `oid run` on small requirements once the inner loop works. Keep the manual path available until the decision layer is stable, and always run oid from an installed build, never from the code it is changing. See `docs/BOOTSTRAP.md`.
**Consequences.** Dogfooding starts in the first week. A bug in oid cannot block its own fix.

## ADR-025: `oid progress done` checks only what the progress file can prove

**Context.** FR-PROG-06 lets `oid progress done` mark a feature done when it has at least one scenario and every scenario is in `pass`. `docs/design.md` §4.4 adds three more conditions: the feature is at `cycle_step: quality_gate`, the quality gate has passed, and every scenario went through at least one TDD cycle. The last two can only be checked from `.outside-in/session.json`, which arrives with the feature cycle (FR-RUN).
**Options.** Require `quality_gate` now and the rest later; add all three together once `session.json` exists.
**Decision.** Until the feature cycle exists, `oid progress done` enforces FR-PROG-06 only. The `quality_gate` step, the passed gate and the per-scenario TDD cycle are added together, with `session.json`, as part of the feature cycle (FR-RUN-06, FR-RUN-07).
**Consequences.** While bootstrapping, a feature can be marked done from any step; the quality gate before every commit (`AGENTS.md`), the pre-commit `oid check` and CI hold the line meanwhile. This is not reopened before FR-RUN.

## ADR-026: FR ids may carry a one-letter suffix

**Context.** Buddy, the first project to adopt oid, splits requirements by adding a lowercase letter to the number (`FR-PERM-06b`, `FR-SETTINGS-03c`); four of its 91 tracked features use such ids, one of them its only pending feature. The id pattern in `DOMAIN.md` (`FR-[A-Z][A-Z0-9]*-\d{2,3}`) rejected them in `SPEC.md`, in `progress.json` and in `oid check`, so `oid init --import-progress` would have dropped them.
**Options.** Treat them as frozen debt and leave them out of the imported progress (ADR-011); widen the pattern.
**Decision.** An FR id may end in one optional lowercase letter: `FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?`. NFR ids are unchanged.
**Consequences.** Projects that split requirements this way adopt oid without renaming them. The SPEC.md parser, the progress schema and `oid check` all use the same pattern.
