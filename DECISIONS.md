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
**Consequences.** Every verification is empirical. Agents cannot add dependencies themselves, so a `request_dependency` tool exists (§7.7). The absolute ban on a shell is superseded by ADR-029: verification stays here; exploration does not.

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

## ADR-027: Code analysis with TypeScript 6, and what S4 found about the detectors

**Context.** Spike S4 (`docs/BOOTSTRAP.md`, Phase 1) ran the detectors on oid and on a throwaway copy of Buddy (about 61,000 lines of TypeScript and Svelte; Buddy compiles with TypeScript 5.9.3). The design (§9.3) builds complexity, magic values, documentation drift, the reuse catalogue and reference lookups on the TypeScript compiler API, but oid pins `typescript@7.0.2`, whose package no longer exports the classic API (`createProgram`); it only offers `typescript/unstable/sync` and `/async`, which talk to the native binary in another process. Measured on Buddy: `tsc --noEmit` about 7 s; `knip@6.39.0` 4.8 s; `jscpd@5.4.0` 3.2 s, 161 clones, 2.4 % of lines, 108 of the clones in `tests/`; a `Program` over the project with the classic API 1.8 s plus 56 ms to walk 5,741 functions. `knip` without configuration reported 5 unused files that are entry points it did not infer (`backends/sidecar-entry.ts`, four `scripts/*.ts`), 2 exports of a generated file, 11 exports of the script oid replaces, 43 exported types used only in their own file, and one unused dev dependency; the Svelte frontend caused no errors. `knip` 6 parses with `oxc-parser` and has no TypeScript peer dependency.
**Options.** For the analysis engine: TypeScript 7's unstable API; TypeScript 5.9.3 or 6.0.3 under an npm alias; `oxc-parser` (syntax only, no types or references). For duplication in tests: one percentage; tests excluded; tests detected but reported separately.
**Decision.** The analysis engine is `typescript@6.0.3` (the classic API, `createProgram` and `createLanguageService`), a runtime dependency under an npm alias; TypeScript 7.0.2 keeps compiling oid. Duplication is detected in source and tests, and the metrics report its percentage for source code and for tests separately. `knip` runs with oid's own configuration: entry points inferred from `package.json` and the test commands plus `refactor.entry`, and generated files (`*.generated.*`) ignored. `tsc --noEmit` in `CODE_GREEN` needs no incremental mode at Buddy's size.
**Consequences.** Two TypeScript versions in oid's dependency tree, one for building and one for analysing; the analysis one is revisited when TypeScript 7's API stops being unstable. One diagnostic seen with 6.0.3 on oid (the `node` type library not found when running from another directory) does not affect syntax-only detectors and must be understood before type diagnostics come from this engine. The exported-types-used-locally findings are real but low-value: they enter the baseline (FR-MET-07) rather than block. Buddy needs `refactor.entry` for its sidecar and scripts.

## ADR-028: BDD scenarios run oid in-process; only `@process` scenarios launch the built binary

**Context.** Every `When I run oid …` step launched a new Node process that compiled `src/` on the fly with `tsx`: about 1.3 s per run before the command did anything, and about 2.7 s for `oid metrics` on a one-file project. With 346 scenarios run one after the other, the BDD suite took 5–6 minutes and the quality gate about 9. `runCli(argv, { cwd, stdout, stderr })` already returns the exit code and is the only code that `src/cli.ts` wraps; nothing else in `src/` reads `process.cwd`, `process.env`, `process.argv` or the process streams, and no module keeps mutable state.
**Options.** Keep subprocesses and only speed them up (build once, parallel scenarios); run every scenario in-process; run most scenarios in-process and keep a few in a real process.
**Decision.** Scenarios run `runCli` in-process by default, capturing stdout, stderr and the exit code. Scenarios that need a real process (stdout closed early, the process exit code, the binary itself) are tagged `@process` and run `node dist/cli.js`, built once before the BDD suite from the same source; a missing or stale build fails the scenario with a clear message instead of testing old code. Scenarios run in parallel. External tools that oid itself launches (`git`, `jscpd`, `knip`) stay real.
**Consequences.** The scenarios test the same code that ships, the `@process` ones the same build. `src/cli.ts` must stay a thin wrapper: behaviour added there is only covered by `@process` scenarios. Code in `src/` must not read process globals or keep module state, or in-process scenarios would leak into each other. `oid metrics` scenarios stay the slowest, bound by `jscpd` and `knip`.

## ADR-029: Shell by profile, with a floor and a classifier

**Context.** ADR-005 bans `bash` for every agent because Pi has no process permissions. A shell can bypass path checks, edit orchestrator state, read secrets, and report its own test result. The same ban removes the loop implementers and debuggers need: run a command, read the output, discard the attempt, before the step's solution exists. The orchestrator's test run does not replace that loop. `pi-permission-gate` already does deny-by-default command and path rules per tool. `pi-warden`'s action guard is the other half: an offline floor for what is dangerous on its face, and Jev only when a score can change the outcome, so a pattern is evidence and not the only verdict.
**Options.** No shell for anyone (ADR-005); a global shell; a shell only on the profiles that implement or debug, behind a deterministic floor and a classifier.
**Decision.** Supersedes the absolute ban in ADR-005. Profiles decide who gets a shell. Agents that do not implement or debug get none. Implement and debug profiles get one, inside the run's worktree. Three checks, in order:
1. **Containment.** Paths in the command, including those inside `bash -c`, `node -e`, and the same kind of wrapper, stay inside the worktree. Files only the orchestrator may write (`progress.json`, `.outside-in/`, and git state the step must not touch) cannot be modified through the shell.
2. **Profile policy.** Deny-by-default, the shape of `pi-permission-gate`: an allow list of commands for that profile. A deny wins. The implement and debug lists include that project's quality gate (lint, tests, typecheck, and the same class of check). The prompt for those profiles tells the agent to run that gate before it reports the task done, and to read the output. Left unsaid, the agent treats a plausible implementation as finished and skips format, types and tests. That feedback is fast and cheap, and it saves a later cycle in which the next agent finds the failure and sends the work back.
3. **Classifier.** Jev, through the same adapter as the other decisions, on what the floor cannot settle: credentials, private data leaving the machine, paths that should not be read, commands that are dangerous in this step. Patterns go to the classifier as evidence. If the classifier is unavailable, the floor still holds: no credential read and no write outside the worktree.

A quality-gate command the agent runs is feedback for that attempt. It does not decide Red or Green and it does not advance the cycle. The orchestrator does, from its own run of the runner's report.
**Consequences.** ADR-005 still governs verification and every profile without a shell. Implement and debug agents can probe, and their prompt requires the quality gate before they report done. The shell is a sandbox surface of its own and needs tests for wrappers, symlinks, and writes to orchestrator state. The rule is now stated in SPEC.md NFR-02 and docs/design.md. The sandbox, the per-profile allow list and their tests are still unbuilt (FR-AGENT). Until that code exists, no agent has a shell.

## ADR-030: `oid verify` before Jev: an external decision, and a local checkpoint

**Context.** FR-VERIFY brings the Red Gate, the regression check and the integrity check to M0 as standalone commands (`oid verify red|green|integrity`), but Jev arrives in M1. In the Red Gate (§6.4, §8.2) Jev classifies the failures the deterministic layer cannot (any other runtime error; `X is not a function` when `X` exists), confirms that an `AssertionError` is the assertion of the new behaviour, and judges whether the test is meaningful. Integrity (§6.5) compares the worktree with the last checkpoint, but git checkpoints arrive with FR-GIT-02; comparing with HEAD would count the test written in `tdd_red` as a forbidden test change in `tdd_green`.
**Options.** For the decisions Jev will take: treat them all as "not a Red" (conservative); accept them all; or hand them to whoever orchestrates. For integrity: compare with HEAD (and commit every Red); or record a checkpoint locally.
**Decision.** `oid verify red` decides the clear cases itself (exit 0 valid, exit 1 not valid). The cases that belong to Jev end with exit 2, "needs a decision": the output shows the trimmed failure, the test and Jev's questions, and whoever orchestrates (the human, or the agent driving the cycle, such as Claude Code) answers with `--decide <class>`; the answer is recorded as an external decision. When Jev exists it answers the same question, and the human only when Jev is unsure. Every `oid verify red|green` that passes records `.outside-in/checkpoint.json` (the step verified, the feature, whether the decision was external, and the hashes of the files that differ from HEAD); `oid verify integrity` compares with it, or with HEAD when there is none. Type errors count when they are in `paths.source`, without comparing with HEAD. The runners are the configured commands with oid's arguments appended.
**Consequences.** Every ordinary TDD Red (an `AssertionError`) needs one external answer until Jev arrives. The orchestrating agent is not the one that wrote the test, so its answer is as reliable as a human's for this purpose. The checkpoint is local and is replaced by git checkpoints (FR-GIT-02); the Claude Code hooks of the §2.5 switch-over read it to require the matching verify before `oid progress step`. Projects whose source does not compile clean cannot use `oid verify green` until it does.

## ADR-031: Pi 1.0.3 delta confirmed (spike S1)

**Context.** ADR-003 pins Pi at 1.0.3 and lists everything Buddy 1.0.1 already proved (agent-dir isolation, `beforeToolCall` blocking, the single tool array, `session.abort()`). Three behaviours remained unverified on 1.0.3: (a) `prompt()` and `classify()` reporting a bad API key as `stopReason: "error"` instead of a rejected promise, (b) `SessionManager.create(cwd, dir)` writing the transcript in the given directory, and (c) `session.abort()` matching Buddy's usage. Spike S1 ran a script (`spikes/s1/spike.ts`, now deleted) on 1.0.3.
**Findings.**
1. `prompt()` with an invalid Anthropic key resolves (does not reject) with `stopReason: "error"` and `errorMessage` carrying the 401 body. The `message_end` event delivers the same fields.
2. `classify()` with an invalid OpenRouter key resolves (does not reject) with `stopReason: "error"` and `errorMessage` carrying the 401 body. The classifier catalog on OpenRouter includes `typesafe/jev-1.13` (versioned) and `~typesafe/jev-latest` (alias).
3. `SessionManager.create(cwd, sessionDir)` returns a manager whose `getSessionDir()` is `sessionDir` and whose `getSessionFile()` points inside it. The `.jsonl` file does not exist on disk until the first `appendMessage()`; before that, the path is announced but the file is absent. This is the same lazy-write behaviour Buddy observed.
4. `AgentSession.prototype.abort` is present and has the same `abort(): Promise<void>` signature as 1.0.1. Not exercised live (already covered by Buddy's BDD suite).
**Decision.** All four behaviours match the design's assumptions. No design change needed. ADR-003's pin on 1.0.3 is confirmed.
**Consequences.** The pending S1 verification in `docs/design.md` §20 is closed. Error handling in `agents/runner.ts` must check `stopReason` on every `prompt()` and `classify()` result, never rely on a rejection. Session directories passed to `SessionManager.create` must exist before the call. The Jev model for oid is `typesafe/jev-1.13` on OpenRouter (versioned, not the `~latest` alias).

## ADR-032: A scenario passes only with a current green that ran it

**Context.** `oid progress scenario pass` recorded whatever the agent declared, so "pass" in `progress.json` was a claim, not evidence. `oid verify green` already runs the unit suite, the scenarios recorded as pass and the type check, and records a checkpoint bound to the content it verified (ADR-030).
**Options.** (1) Keep trusting the declaration. (2) `oid verify green` also runs the scenarios of the focused feature, so a pass can be backed by it: rejected, because it would lengthen every green while a feature is focused. (3) `oid verify green <feature>:<line> [...]` runs the same green and those scenarios in the same BDD run as the already-passing ones, and the checkpoint lists what ran: chosen.
**Decision.** `oid verify green` with no arguments is unchanged and adds no scenario to the evidence. With targets, the named scenarios must pass; one that fails or cannot be located makes the green fail with the problem listed, and no checkpoint is recorded. A passing green records in `.outside-in/checkpoint.json` the scenarios it ran and that passed (their feature id, the `@FR` tag, and name): those already recorded as pass plus the targets. A verify red lists none. `oid progress scenario pass <FR> "<name>"` succeeds only if the last checkpoint is a green, it lists that feature and exact name, and nothing changed since it (`paths.progress` and `.outside-in/` left out); otherwise it refuses and names the `oid verify green <feature>:<line>` to run. `fail` and `pending` need no evidence. `oid progress done <FR>` keeps its conditions (at least one scenario, every scenario in pass) and also needs the same evidence for each scenario in pass: the last checkpoint is a green that lists the feature and the scenario, and nothing changed since it (`paths.progress` and `.outside-in/` left out). Otherwise it refuses, names the scenarios without evidence or the files changed, says to run `oid verify green`, and writes nothing. A final `oid verify green` with no arguments gives that evidence. This is not ADR-025's deferred conditions (quality_gate step, passed gate, TDD cycle per scenario), which stay deferred to FR-RUN.
**Consequences.** Marking a scenario pass costs one green that names it, run after the last edit. Editing any file after the green, including a test, requires running it again. Scenarios already in pass are re-run by every green, so they keep their evidence without being named again.

## ADR-033: An assertion added since the checkpoint is a valid Red without a decision

**Context.** ADR-030 sends every `AssertionError` to an external decision (exit 2) until Jev arrives, so every ordinary Red costs one answer. In practice almost all of them are the assertion the agent just wrote for the new behaviour. `oid verify integrity` already knows which lines of each file were added since the last checkpoint.
**Options.** (1) Keep exit 2 for every assertion. (2) Accept every assertion as a valid Red: rejected, an assertion that already existed and now fails is a regression or a broken test, not a Red. (3) Accept an assertion whose first stack frame is a line of a unit test or step file added since the last checkpoint (the same added lines integrity computes): chosen.
**Decision.** `oid verify red` classifies an `AssertionError` whose first stack frame falls on a line of a unit test or step file added since the last checkpoint as a valid Red (`business_assertion`, exit 0, not an external decision). An assertion on a line that already existed stays at exit 2. Nothing else changes: any other runtime error, `X is not a function` when `X` exists, failures of the environment and an assertion outside the test files still need a decision (exit 2, for Jev later); `missing_implementation` is unchanged.
**Consequences.** Amends ADR-030's consequence "every ordinary TDD Red needs one external answer": only an assertion on a line that already existed does. Whether the new assertion is meaningful is no longer asked for these Reds; integrity's forbidden patterns and the review of the feature file remain the checks on the test itself.

## ADR-034: One checkpoint per feature

**Context.** ADR-030 and ADR-032 record every verification in a single `.outside-in/checkpoint.json`. Each verify replaced it, so the green of one feature wiped the evidence of another, and integrity judged the focused feature against whatever verification was written last.
**Options.** (1) Keep the single file. (2) Keep a history of checkpoints and search it: rejected, more than the rules need. (3) One checkpoint per feature, with the single file kept for verifications with no feature: chosen.
**Decision.** Amends only the path ADR-030 and ADR-032 wrote down; what a checkpoint holds and what it proves are unchanged. Every verify writes `.outside-in/checkpoints/<id>.json` for the feature it verifies (a green, for the feature in focus and for the feature of each target), with the copies of its files beside it, and never replaces the checkpoint of another feature. A verify with no feature (no focus, no target) still writes `.outside-in/checkpoint.json`. When a feature has no file of its own and that single file names it, it is used. `oid progress scenario pass`, `oid progress done` and `oid verify integrity` read the checkpoint of the feature they judge (the FR named, or the feature in focus).
**Consequences.** Working on two features no longer costs one the evidence of the other. A checkpoint written by an earlier version (the single file naming the feature) keeps working, and so do the Claude Code hooks that read it. Switching the focus means integrity compares with that feature's own last verification, so changes made for another feature in between are reported.

## ADR-035: When the cycle has no legal move, the human moves the step

**Context.** A forward move of `cycle_step` needs the matching `oid verify` on the current content (ADR-030, ADR-032), and from `bdd_red` the only move is to `tdd_red`, after a valid Red. Fixing a step definition is test work, so it is done in `bdd_red`. In FR-RUN-01 such a fix left every scenario green: no Red was possible, and the agent had no legal way forward. The same happened in FR-AGENT-07, where a change had to be absorbed outside the hook. A mutation of the source to force a Red is refused by integrity, as it should be.
**Options.** (1) A new transition, `bdd_red` → `tdd_green`, allowed after a green that ran every scenario of the feature: rejected for now; it opens a path to skip a Red that an agent could take on purpose. (2) The agent works around the hook: rejected. (3) The agent stops and the human moves the step outside the hook: chosen.
**Decision.** When the agent driving the cycle is in a state with no legal move forward, it stops and says why. The human checks the reason and, if it holds, moves the step with `oid progress step` outside the hook. The agent then re-verifies the content (`oid verify green`) before recording anything, and mutation-checks any scenario that passed without a Red. The move is logged in `docs/bootstrap-log.md` as a human intervention, with its reason.
**Consequences.** No transition or hook changes. The escape stays rare and visible, as each use is in the log. `oid run`'s state machine will need its own answer to the same case (a test fix inside `BDD_RED` that leaves the suite green); this entry does not decide it.

## ADR-036: A green verifies its own features; the whole-project regression is the gate's

**Context.** `oid verify green` runs every scenario recorded as passing in the project (FR-VERIFY-04, ADR-032). With 520 of them it takes about 86 s, 70 s of it cucumber, and it grows with every feature. An agent runs it several times per scenario, so most of a feature's cycle time is spent re-running scenarios of other features that the change rarely touches. The quality gate already runs the whole BDD suite before every commit (`AGENTS.md`).
**Options.** (1) Keep the whole-project regression in every green. (2) Run only the scenarios a change can affect, from a map of files to scenarios: rejected for now, it needs a dependency map that does not exist. (3) Cache scenario results by the content they read: rejected for now, a wrong dependency set gives stale passes. (4) A green runs the passing scenarios of the features it verifies; the whole-project regression stays in the quality gate: chosen.
**Decision.** Amends what ADR-032 says a green runs; what it records and what evidence it gives are unchanged. A green runs the unit suite, the type check and, in one BDD run, the scenarios recorded as passing of the features it verifies (the feature in focus and the feature of each target) plus its targets. With no focus and no target it runs no scenario. The unit suite still runs in full. The checkpoint lists the scenarios that ran and passed, so `oid progress scenario pass` and `oid progress done` work as before. `oid run`'s own regression in `BDD_RED` and `BDD_CHECK` (design §6.7) is not changed by this entry.
**Consequences.** A green costs the unit suite plus one feature's scenarios, about 25–35 s, and no longer grows with the project. A regression in another feature is found at the quality gate instead of at the step that caused it: the gate's failure is a new Red for the feature being built (`quality_gate` → `bdd_red` or `tdd_red`), so it is still fixed before the commit, but later. Fixing a finished feature with no focus needs its scenarios as targets, as it already does to record them as passing.

## ADR-037: oid derives the fix and check invocations of the project's formatter and linter

**Context.** The quality gate needs to autofix format and lint and then check what remains, with lint errors as a structured list so that QUALITY_FIX can route them to the owner of each file (§6.9). The configuration has one command each (`commands.format`, `commands.lint`), which `oid init` fills with the project's own scripts.

**Options.** (1) Treat them as fix commands whose output must be ESLint JSON: rejected, it does not match what `oid init` writes and forces a fix run at baseline. (2) Separate fix and check commands in the schema: rejected for now, it changes the schema and FR-INIT. (3) oid recognises the tool and appends its own flags, as it does for cucumber and vitest: chosen.

**Decision.** For ESLint, oid appends `--fix` to autofix and `--format json` to check. For Prettier, it appends `--write` and `--check`. The tool is recognised from the command text, or from the body of the npm script the command runs (the flags then go after `--`). Baselines use the check invocation. A tool oid does not recognise is run as it is and judged by its exit code: its failure is a question to the human, not a QUALITY_FIX. Biome is added later.

**Consequences.** Projects keep a single command per tool. A new linter needs an adapter in oid before its errors can be fixed automatically.
