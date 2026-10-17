# Architecture decisions

Each entry is a decision in force: its context, the options considered, the decision and its consequences. When a decision changes, the human decides, and the entry is rewritten in place, or replaced by a new one and removed, in the commit that changes the design and the spec with it (ADR-054). Git keeps every earlier version; a number is never reused.

Full technical design: `docs/design.md` (section numbers below, as §n, refer to it).

Most entries are decisions about the product, oid. An entry with a **Scope.** line is about the process of building it (the dogfooding with Claude Code and its hooks) and does not shape how `oid run` works. An entry with an **Article.** line extends or deviates from the methodology article (ADR-054).

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

## ADR-003: Pi major v1, one exact version in package.json

**Context.** oid embeds Pi and relies on its session, tool-hook, classifier and terminal APIs. oid is installed from a packed tarball, and a global install does not use oid's lockfile, so a version range would give each install a Pi nobody tested.
**Decision.** oid depends on Pi major v1. `package.json` keeps `pi-coding-agent`, `pi-ai`, `pi-agent-core` and `pi-tui` at one exact v1 version, the same for all four. Moving to another v1 version is a routine `chore(deps)` commit: review Pi's changelog against the APIs oid uses, then the type check and the full gate; a changed Pi behaviour oid relies on goes into `DOMAIN.md`. Leaving v1, or an update that changes how oid uses Pi, is a change to this decision.
**Consequences.** Upgrades are deliberate and break the test suite, not a run: a compatibility test checks the shapes oid uses (NFR-09). Pi's own transitive dependencies are fixed by ADR-052.

## ADR-004: Jev through Pi's classifier API, behind a thin adapter

**Context.** Micro-decisions (is this failure a valid Red? is this finding worth fixing?) are too fuzzy for code and too small for a reasoning model. Jev returns typed decisions with calibrated probabilities in about 200 ms. Pi 1.0 exposes classifier models through `classify()` with the same credentials, cost accounting and error handling as chat models.
**Options.** TypeSafe's SDK directly; an LLM with structured output; Pi's `classify()`.
**Decision.** `PiClassifierAdapter` over `modelRuntime.classify()`, behind oid's own `DecisionAdapter` interface. Default model `typesafe/jev-1.13` on OpenRouter, because it is versioned; TypeSafe's direct catalogue only lists `jev-latest`. Pi's `bool` questions are Jev's `noul`.
**Consequences.** No second client. A local model (`llama-cpp-classify`) can replace Jev with no new code, only calibration. `classify()` never rejects: errors arrive as `stopReason: "error"` and must be checked.

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
**Decision.** Every session uses oid's own `agentDir` (`<config dir>/agent`, ADR-048; `$OID_AGENT_DIR` overrides it) and a `systemPromptOverride`, with skills, context files, extensions, prompt templates and themes turned off. A test checks every call to `createAgentSession`.
**Consequences.** Runs are reproducible across machines and a user's personal Pi configuration cannot change what oid does. Credentials live in oid's agent directory; importing Pi's is an explicit option of `oid setup` (ADR-048).

## ADR-009: Ephemeral sessions, persisted transcripts

**Context.** Context isolation needs a fresh session per task; debugging needs to see what an agent did.
**Decision.** A new session per task with `SessionManager.create()` in the run's folder, not in memory.
**Consequences.** No context leaks between tasks; every transcript can be opened from the interface.

## ADR-010: Worktree, checkpoints and one commit per feature

**Context.** `git checkout -- .` (the first design) does not remove untracked files and reverts to the last commit, losing earlier good steps. Rolling back in the user's working copy can destroy their changes.
**Options.** Work in place; a branch per feature; a worktree per run with checkpoints.
**Decision.** Each run works in its own worktree and branch. Every passed gate is a checkpoint commit; rollback is `reset --hard` to it plus `clean` in the step's writable paths. Each feature is squashed into one commit. The main branch is never touched.
**Consequences.** Clean history and safe rollbacks; the user merges the branch. Each worktree needs dependencies (ADR-019).

## ADR-011: The artefact formats start from the article; Buddy is an engineering reference

**Context.** Buddy started before the methodology was settled, and part of the article was learned from its mistakes. Its `SPEC.md` and `progress.json` differ from the article.
**Decision.** `SPEC.md`, feature files and `progress.json` follow the article's formats; a format changes only through a recorded deviation (ADR-054). Buddy is a reference for engineering (Pi usage, testing lessons), not for artefacts. Projects with an older progress schema are converted once (`oid init --import-progress`).
**Consequences.** One format to parse and validate. Older requirements in such projects become frozen debt (ADR-021).

## ADR-012: `progress.json` and `session.json` are different things

**Context.** The methodology's progress record and the harness's execution state were mixed in the first design.
**Decision.** `progress.json` (versioned) records where the methodology is: the article's schema, plus only the typed fields a methodology fact needs (a guard's reason, ADR-049), and no free text. `.outside-in/session.json` (ignored by git) records what oid needs to resume. Anything else oid needs goes to the session or the event log.
**Consequences.** The progress file stays useful without oid and cannot degrade into notes. What keeps it from degrading is that every field is typed and validated, not that its fields are the article's.

## ADR-013: Feature files are reviewed by a human, once, up front

**Context.** Acceptance scenarios define what gets built; a wrong scenario is built precisely. Reviewing per feature interrupts unattended runs.
**Decision.** The feature files of all target requirements are written and reviewed at the start of a run; after approval the run is unattended.
**Consequences.** One interruption per run.

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

## ADR-017: Layered Red gate, with an external decision until Jev exists

**Context.** In TDD the most common Red is that the function does not exist yet. In vitest a missing export arrives as `undefined` and fails as `TypeError: (0 , name) is not a function`; a missing module fails the file load. Treating these as broken tests blocks the cycle; treating every runtime error as Red lets broken tests through. Almost every ordinary Red is the assertion the agent just wrote for the new behaviour.
**Decision.** Layers, from the cheapest: the exit code; deterministic classification of the structured report, resolving missing names against the project's real exports; an `AssertionError` whose first stack frame is on a line of a unit test or step file added since the last checkpoint is a valid Red (`business_assertion`), while one on a line that already existed is not decided here; then Jev for what remains ambiguous; then a threshold with a conservative default. Until Jev exists, what would go to it is an external decision: `oid verify red` exits 2 with the trimmed failure and the questions, and whoever orchestrates answers with `--decide <class>`, which answers the recorded failure without running the test again and is refused if any file but the progress file changed since. `oid run` asks the human.
**Consequences.** Most Reds are classified without a model. Whether a newly added assertion is meaningful is not asked; integrity's forbidden patterns and the review of the feature file remain the checks on the test itself.
**Article.** Extends "confirm RED" (implementation, steps 2 and 3): a Red must fail for the right reason, and a second party, not the agent that wrote the test, decides when the reason is not clear.

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
**Article.** Replaces "Refactor: simplify if needed" (step 5): refactoring is driven by detector findings, at three scales, because "if needed" had no signal and did not happen.

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

## ADR-024: oid is built with its own methodology, and takes over its own development step by step

**Context.** oid should be built with its own methodology and used on itself as early as possible. The real unknowns were technical: the Pi sandbox, Jev on real traces, `pi-tui`.
**Decision.** oid is built with Claude Code following the methodology through `AGENTS.md`. The requirements are ordered so that each deterministic piece replaces a manual part of the process as soon as it exists (progress, checks, metrics, Red/Green verification), and `oid run` takes over requirements as it becomes able to. The manual path stays usable until the decision layer is stable. oid always runs from an installed build, never from the code it is changing. See `docs/BOOTSTRAP.md`.
**Consequences.** A bug in oid cannot block its own fix. The rules that only the bootstrap needs (Claude Code hooks, overrides, the bootstrap log) live in `docs/METHODOLOGY.md` and ADR-045, not in oid's design.
**Scope.** The process of building oid (dogfooding with Claude Code), not the product.

## ADR-026: FR ids may carry a one-letter suffix

**Context.** Buddy, the first project to adopt oid, splits requirements by adding a lowercase letter to the number (`FR-PERM-06b`, `FR-SETTINGS-03c`); four of its 91 tracked features use such ids, one of them its only pending feature. The id pattern in `DOMAIN.md` (`FR-[A-Z][A-Z0-9]*-\d{2,3}`) rejected them in `SPEC.md`, in `progress.json` and in `oid check`, so `oid init --import-progress` would have dropped them.
**Options.** Treat them as frozen debt and leave them out of the imported progress (ADR-011); widen the pattern.
**Decision.** An FR id may end in one optional lowercase letter: `FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?`. NFR ids are unchanged.
**Consequences.** Projects that split requirements this way adopt oid without renaming them. The SPEC.md parser, the progress schema and `oid check` all use the same pattern.

## ADR-027: Code analysis with TypeScript 6

**Context.** The detectors, the reuse catalogue and reference lookups use the TypeScript compiler API, but oid compiles with TypeScript 7, whose package no longer exports the classic API (`createProgram`); it only offers an unstable API that talks to the native binary in another process. Measured on a copy of Buddy (about 61,000 lines): a `Program` with the classic API 1.8 s; `knip` 4.8 s; `jscpd` 3.2 s, with most clones in tests; `tsc --noEmit` about 7 s. `knip` without configuration reported entry points it did not infer as unused files.
**Options.** For the analysis engine: TypeScript 7's unstable API; TypeScript 5.9 or 6.0 under an npm alias; `oxc-parser` (syntax only, no types or references). For duplication in tests: one percentage; tests excluded; tests detected but reported separately.
**Decision.** The analysis engine is `typescript@6.0.3` (`createProgram`, `createLanguageService`), a runtime dependency under an npm alias; TypeScript 7 keeps compiling oid. Duplication is detected in source and tests and reported separately for each. `knip` runs with oid's own configuration: entry points inferred from `package.json` and the test commands plus `refactor.entry`, and generated files (`*.generated.*`) ignored. `tsc --noEmit` in `CODE_GREEN` needs no incremental mode.
**Consequences.** Two TypeScript versions in oid's dependency tree, one for building and one for analysing; the analysis one is revisited when TypeScript 7's API is stable. With 6.0.3, the `node` type library is not found when running from another directory: it does not affect syntax-only detectors, and must be understood before type diagnostics come from this engine. Exported types used only in their own file are real but low-value findings: they enter the baseline rather than block.

## ADR-028: BDD scenarios run oid in-process; only `@process` scenarios launch the built binary

**Context.** Every `When I run oid …` step launched a new Node process that compiled `src/` on the fly with `tsx`: about 1.3 s per run before the command did anything, and about 2.7 s for `oid metrics` on a one-file project. With 346 scenarios run one after the other, the BDD suite took 5–6 minutes and the quality gate about 9. `runCli(argv, { cwd, stdout, stderr })` already returns the exit code and is the only code that `src/cli.ts` wraps; nothing else in `src/` reads `process.cwd`, `process.env`, `process.argv` or the process streams, and no module keeps mutable state.
**Options.** Keep subprocesses and only speed them up (build once, parallel scenarios); run every scenario in-process; run most scenarios in-process and keep a few in a real process.
**Decision.** Scenarios run `runCli` in-process by default, capturing stdout, stderr and the exit code. Scenarios that need a real process (stdout closed early, the process exit code, the binary itself) are tagged `@process` and run `node dist/cli.js`, built once before the BDD suite from the same source; a missing or stale build fails the scenario with a clear message instead of testing old code. Scenarios run in parallel. External tools that oid itself launches (`git`, `jscpd`, `knip`) stay real.
**Consequences.** The scenarios test the same code that ships, the `@process` ones the same build. `src/cli.ts` must stay a thin wrapper: behaviour added there is only covered by `@process` scenarios. Code in `src/` must not read process globals or keep module state, or in-process scenarios would leak into each other. `oid metrics` scenarios stay the slowest, bound by `jscpd` and `knip`.

## ADR-029: A shell only for the agents that implement, and `try` to check their own work

**Context.** Pi has no permission system for processes. A shell lets an agent bypass path checks, edit orchestrator state, read secrets and report its own test result. Without one, the agents that implement or debug lose the loop they need: run a command, read the output, discard the attempt. Running the full suites from inside an agent session costs minutes of that session and tells the agent nothing oid will not tell it anyway.
**Options.** No shell for anyone; a shell for every agent; a shell only on the profiles that implement or debug, behind a deterministic floor and a classifier.
**Decision.**
- Profiles decide who gets `bash`. The agents that write code (`CODE_GREEN`, `REFACTOR` and the fixes they own) get one, inside the run's worktree. Every other agent has none: `bash` is excluded and absent from its allowlist.
- A shell command goes through three checks, in order. **Containment**: every path in the command, including inside `bash -c`, `node -e` and similar wrappers, stays inside the worktree, and the files only the orchestrator writes (`progress.json`, `.outside-in/`, the git state of the run) cannot be modified. **Profile policy**: deny-by-default, an allow list of commands per profile (the project's gate commands); a deny wins. **Classifier**: Jev decides what the floor cannot settle (credentials, private data leaving the machine, dangerous commands for the step), with the patterns as evidence; without it, the floor still holds.
- Every agent that writes tests or code has the `try` tool (FR-VERIFY-09): one test or scenario, then the type check and the linter on the files changed since the last checkpoint, in seconds, recording nothing. The prompts tell the agents to check their work with it and not to run the full suites.
- Whatever an agent runs is feedback for its attempt. Red, Green and moving the cycle on are decided by the orchestrator from its own runs. Git and package management stay with the orchestrator; an agent asks for a package with `request_dependency`.
**Consequences.** Every verification is empirical, never self-reported. The shell is a sandbox surface of its own, tested for wrappers, symlinks and writes to orchestrator state. The classifier layer arrives with FR-DEC.

## ADR-030: `oid verify` records the evidence of the cycle, per feature

**Context.** Before the state machine existed, an agent driving the cycle by hand needed Red, Green and integrity as commands whose answers it could not fake, and "pass" in `progress.json` had to be evidence, not a claim. A green that re-ran every passing scenario of the project grew with every feature and dominated the cycle time; the quality gate already runs the whole BDD suite before every commit.
**Options.** For scope: the whole-project regression in every green; only the scenarios a change can affect (rejected: needs a dependency map that does not exist); the features the green verifies. For where evidence lives: one checkpoint file (rejected: each verify wiped the evidence of other features); a history of checkpoints (rejected: more than the rules need); one checkpoint per feature.
**Decision.**
- `oid verify red|green|integrity` are standalone commands. The runners are the configured commands with oid's arguments appended. Only one `oid verify` runs at a time in a working copy (`.outside-in/verify.lock`).
- A green runs the whole unit suite, the type check (source, unit tests and step definitions) and, in one BDD run, the scenarios recorded as passing of the features it verifies (the feature in focus and the feature of each target) plus its targets. The whole project's regression is the quality gate's.
- Every passing verify records the checkpoint of the feature it verifies, `.outside-in/checkpoints/<FR>.json`: the step, whether it was a Red or a green, whether the decision was external, the scenarios a green ran and passed, and a copy of the files that differ from `HEAD`. It never replaces another feature's checkpoint. A verify with no feature writes `.outside-in/checkpoint.json`, which is used for a feature that has no checkpoint of its own and is named there.
- `oid progress scenario pass` and `oid progress done` require that the feature's checkpoint is a green that lists the scenario (for `done`, every scenario) and that nothing changed since it (the progress file and `.outside-in/` aside); otherwise they refuse and name the `oid verify green` to run. `fail` and `pending` need no evidence. `done` also requires at least one scenario, every scenario in `pass` and every scenario tagged with the feature recorded. It checks only what the files can prove; in `oid run`, the passed gate and the unit test per scenario follow from the control flow.
- `oid verify integrity` compares the working tree with the feature's checkpoint, or with `HEAD` when there is none.
**Consequences.** Marking a scenario pass costs one green, run after the last edit; any edit after it, a test included, needs another. A green costs the unit suite plus one feature's scenarios and does not grow with the project. A regression in another feature is found at the quality gate and becomes a new Red for the feature being built. Projects whose code does not type-check clean cannot use `oid verify green` until it does. The Claude Code hooks read the same checkpoints.
**Article.** Extends the quality gate (step 8): two levels of checks, the feature's scenarios during the cycle and the whole project at the gate; and "pass" in the progress file needs the evidence of a run, not a claim.

## ADR-037: oid derives the fix and check invocations of the project's formatter and linter

**Context.** The quality gate needs to autofix format and lint and then check what remains, with lint errors as a structured list so that QUALITY_FIX can route them to the owner of each file (§6.9). The configuration has one command each (`commands.format`, `commands.lint`), which `oid init` fills with the project's own scripts.

**Options.** (1) Treat them as fix commands whose output must be ESLint JSON: rejected, it does not match what `oid init` writes and forces a fix run at baseline. (2) Separate fix and check commands in the schema: rejected for now, it changes the schema and FR-INIT. (3) oid recognises the tool and appends its own flags, as it does for cucumber and vitest: chosen.

**Decision.** For ESLint, oid appends `--fix` to autofix and `--format json` to check. For Prettier, it appends `--write` and `--check`. The tool is recognised from the command text, or from the body of the npm script the command runs (the flags then go after `--`). Baselines use the check invocation. A tool oid does not recognise is run as it is and judged by its exit code: its failure is a question to the human, not a QUALITY_FIX. Biome is added later.

**Consequences.** Projects keep a single command per tool. A new linter needs an adapter in oid before its errors can be fixed automatically.

## ADR-038: A step found wrong after the code exists is fixed from `bdd_red`, and oid returns the feature

**Context.** A step definition can turn out wrong only once the code exists. Integrity forbids editing it at `tdd_green`, `refactor` or `quality_gate`, and from `bdd_red` the only move forward is a Red, which the passing scenario can no longer give. Under that pressure agents moved or reverted source to get a Red, which is exactly what integrity exists to prevent. Inside a scenario every unit Red is also a Red checkpoint, so "the code since the last Red" soon leaves out most of the scenario's code.
**Options.** (1) Allow step edits at `tdd_green`: rejected, a test could then be changed to fit the code. (2) A manual `bdd_red` → `tdd_green` transition: rejected, it skips the Red with nothing to prove. (3) Go back to `bdd_red`, and let oid return the feature after checking what the missing Red would have proved: chosen. For "this cycle's code": the code since the last Red (rejected, see above); the code of the whole feature (rejected, it removes the code of scenarios that already pass); the code since the scenario's own Red: chosen.
**Decision.** Moving to `bdd_red` from `tdd_red`, `tdd_green`, `refactor` or `quality_gate` records a return: the step it came from and the content of the tree. Integrity at `bdd_red` then judges against that record: steps may change, `src/` may not. `oid verify red <scenario>` at `bdd_red` with a return and code in this cycle checks three things: the scenario passes; `src/` is as it was at the return; and with this cycle's code removed the scenario fails. This cycle's code is the source changed since the scenario's Red (the checkpoint `oid verify red <scenario>` records when it moves the feature from `bdd_red` to `tdd_red`), or since the last Red checkpoint when the feature has none. oid makes and undoes that removal itself. If all three hold, it records a checkpoint and moves the feature back to the step it came from; otherwise it says which failed and the feature stays at `bdd_red`. With no code in this cycle, the feature moves to `tdd_red` when `src/` is unchanged and the scenario either fails as a valid Red or already passes: the unit test is still required, and the feature never skips to `tdd_green`. At `bdd_red` with no return, a scenario that already passes and is recorded as passing with the evidence of an earlier green moves the feature to `tdd_red` too; any other scenario that passes at once is not a Red (a human may accept it as a guard, ADR-049).
**Consequences.** Fixing a step needs no human. The mutation check is done by oid, under its control. A step of an earlier scenario fixed at `quality_gate` may still pass without the last scenario's code; then the return is refused and there is no legal move (ADR-045). `oid run` and `oid verify` judge a fixed step against the same base.
**Article.** Deviates from "for each feature, strictly in order": the cycle is a graph, with legal moves back to a Red when a step definition is wrong.

## ADR-039: A changed requirement is revised by the human; a review on a done feature is reopened by the agent

**Context.** A requirement can change once its feature exists; the workaround was a second, corrective FR, which leaves two truths in the spec while git already keeps the old one. A pull request opens with its feature already `done`, and review comments must be fixable without throwing away proof that still holds. A `done` feature's checkpoint is not refreshed when later commits change files it covers, so integrity after a reopen would report those committed changes.
**Options.** (1) `oid progress step` from `done`: rejected, a step keeps the scenarios, which is wrong for a changed contract, and `bdd_red` is too heavy for a review nit. (2) One command for both: rejected, one resets the scenarios and the other must not. (3) Two commands with different owners: chosen.
**Decision.** The criterion: do the passing scenarios still describe the requirement? If not, it changed: `oid progress revise FR-xxx` (FR-PROG-08) puts the feature at `bdd_red` with every scenario `pending`; one already at `bdd_red` is left as it is. The human runs it. If they do (a review comment, a missing case, a bug against the spec): `oid progress reopen FR-xxx` (FR-PROG-09) accepts only a `done` feature, puts it at `quality_gate` with every scenario as it was, and writes its checkpoint from the committed tree at `HEAD`, so only uncommitted changes count as changes. The agent runs it; a missing scenario then goes back with `oid progress step <FR> bdd_red`. The new `done` needs a green of the feature's scenarios when the tree changed, in the same commit as the fix. Neither command edits `SPEC.md` or a feature file. `oid spec --fr` on an existing FR calls `revise`, never `reopen`. With the focus on a `done` feature, `oid verify integrity` names both commands.
**Consequences.** One truth in the spec: a changed requirement is rewritten in place and proved again. A review keeps the proof that still holds. Using `revise` for a review, or `reopen` for a changed requirement, is wrong in both directions.
**Article.** Adds what the article does not cover: work after "done", with two operations and one criterion.

## ADR-040: A feature file is approved per scenario

**Context.** Integrity (`isApproved`) judges a feature file as a whole: it is approved if any scenario in it carries the tag of an FR that is `done` or past `bdd_red`. A `fix-*.feature` shared with finished FRs is frozen entirely, so a feature in `bdd_red` cannot remove or move its own scenario there. And a scenario already recorded as `pass` is not protected by itself: in the outer loop (`bdd_red` on the next scenario) it could be rewritten.
**Options.** (1) Keep the whole-file judgement and split shared files by hand: rejected, it moves the problem and rewrites approved files. (2) Keep passing scenarios on `revise`: rejected, a green's evidence requires that nothing changed since, and removing or moving a scenario already changes a feature file. (3) Judge per scenario: chosen.
**Decision.** For integrity, a scenario is approved if any of its effective tags (those of the `Feature` and of its `Rule` are inherited) belongs to an FR that is `done` or past `bdd_red`, or if the scenario is recorded as `pass` in `progress.json`. A change to a feature file is judged by comparing the scenarios of the file at its base (the one `changedFiles` uses today: the checkpoint, or the return at `bdd_red`) with the current ones, matched by name. An added scenario is allowed if none of its new effective tags is approved. A removed one is allowed if it was not approved at the base. A changed one (text or tags) is allowed if it was not approved at the base and its new tags are not approved either; a tag change counts against both the origin FR and the destination FR. What belongs to no scenario (the `Feature` line and its tags, the description, the `Background`, the header of a `Rule`) keeps today's rule: frozen if any scenario of the file, at the base or now, is approved. A file with two scenarios of the same name, or one that cannot be parsed, is judged as a whole, as today.
**Consequences.** A feature in `bdd_red` can drop or move its own scenarios in a file shared with finished FRs, while the scenarios of those FRs stay frozen. After `revise` every scenario is `pending`, so they can be edited; after `reopen` the `pass` scenarios are protected and only new scenarios can be added. The hole in the outer loop is closed.

## ADR-041: A revised requirement that needs no code leaves `bdd_red` for `quality_gate`, with evidence

**Context.** When a revised FR needs no new code (every scenario unchanged, only the requirement text moved, or scenarios only removed or moved), no Red is possible, and from `bdd_red` the only way forward is `tdd_red`.
**Options.** (1) Let any agent step from `bdd_red` to `quality_gate`: rejected, it is a skipped Red. (2) A separate human approval record: rejected, more machinery than the case needs. (3) One transition, guarded by evidence: chosen.
**Decision.** `oid progress revise` writes `.outside-in/checkpoints/<FR>.revise.json`: the state of the tree plus the normalised text and effective tags of every scenario of the FR. It is deleted where the return record is (`step`, `done`) and rewritten by `revise`. The transition `bdd_red` → `quality_gate` is allowed only when that record exists and: (1) no file under `src/` or among the step files changed since the `revise`; (2) every scenario of the FR exists in the record with the same text and tags, so scenarios may only have been removed or moved; (3) the FR's checkpoint is a green that ran all those scenarios with nothing changed since (`progress.json` and `.outside-in/` aside). Who may make the move is ADR-046.
**Consequences.** The no-code case has a legal exit that needs evidence. The Red is never faked: the transition exists only when nothing executable changed. If something did change, the usual path applies (a Red, or ADR-038).
**Article.** Extends ADR-039's revise: a revised requirement can reach the gate with no Red when no code is needed.

## ADR-043: The commands oid runs from the configuration have a time limit, and the whole process group is stopped

**Context.** `runWriting` (`src/artifacts/verify-runner.ts`) runs every configured command (unit and BDD runners, type check, linter, formatter) with `spawnSync` and no time limit. A runner that hangs hangs `oid verify` and `oid run`; since v0.6.10 it also blocks every later `oid verify`, because the PID in `.outside-in/verify.lock` is still alive. `spawnSync` with `timeout` would kill only its direct child, the shell, and the processes the runner started could survive it. 
**Options.** (1) No limit; the human interrupts: rejected, `oid run` is meant to run unattended, and the lock outlives the hang. (2) `spawnSync` with `timeout`: rejected, it leaves the runner's children alive. (3) A limit per command, and stopping the command's whole process group: chosen.
**Decision.** `limits.command_timeout_s` in `.outside-in.json` limits each command oid runs from the configuration; the default is 600 seconds, the same as `agent_timeout_s` and about four times oid's own slowest command. The limit exists to catch a hang, not to fit a slow suite: a large one hides the problem and leaves a runaway process using resources for that long. A project whose suites need more raises it, and the message of a stopped command names the key. Git and the detectors oid runs itself (knip, jscpd) are not covered. Each command is started as the leader of its own process group; when it passes the limit, oid stops the whole group (SIGTERM, then SIGKILL after a short grace) and waits for it, so no child of the runner survives. This rules out a bare `spawnSync` of the shell: the command runs under a supervisor that owns the group, whether that is an asynchronous spawn or a small synchronous wrapper; the callers of `runWriting` keep their interface. A stopped command is not a failure of the tests: `oid verify` exits 1 naming the command and the limit, as an `environment` failure for `oid verify red`, and `oid run` ends the run with the same message. The locks are released on that path: `.outside-in/verify.lock` by `oid verify`, the run lock by `oid run`. Process groups are POSIX; that is the only platform oid supports today.
**Consequences.** A hung runner costs at most the limit, and leaves no process and no lock behind. Projects whose commands run longer than 10 minutes must raise the limit. The runner of a project gets its own process group, so an interrupt sent to oid's group (Ctrl-C) no longer reaches it directly: the supervisor stops the group when oid is interrupted, as it does at the limit.

## ADR-044: A unit test found wrong after the code exists is fixed from `tdd_red`, and oid returns the feature

**Context.** At `tdd_green`, `refactor` or `quality_gate` integrity forbids editing tests, and at `tdd_red` a fixed test passes, because the code exists, so it is not a Red and the feature cannot move.
**Options.** (1) Allow test edits at `tdd_green`: rejected, a test could be changed to fit the code. (2) A flag that marks a move to `tdd_red` as a fix: rejected, it adds a mode the agent must remember, and the test itself already tells the cases apart. (3) Mirror ADR-038 at `tdd_red`, with the passing test as the sign of a fix: chosen.
**Decision.** Moving to `tdd_red` from `tdd_green`, `refactor` or `quality_gate` records a return, with the same record as ADR-038, and integrity at `tdd_red` judges `src/` against it. `oid verify red <test>` at `tdd_red` with a return: a test that fails is judged by the usual rules (it is the next test of the inner loop, or a gap found at the gate). A test that passes, with code in this cycle (source changed since the last Red checkpoint), is judged as a fix: `src/` must be as it was at the return, and with this cycle's code removed the test must fail as a valid Red. If both hold, oid records a checkpoint that is not a Red base and moves the feature back to the step it came from; otherwise it says which condition failed and the feature stays at `tdd_red`. A passing test with no code in this cycle is still not a Red.
**Consequences.** Fixing a unit test needs no human. A test of an earlier cycle fixed at `quality_gate` may pass without the last cycle's code; then the return is refused and there is no legal move (ADR-045). At `bdd_red` a failing scenario with a return is refused (ADR-038), while at `tdd_red` a failing test is accepted: the asymmetry is deliberate, because a failing test is the normal next step of the inner loop.
**Article.** Deviates from "strictly in order", as ADR-038, for a wrong unit test.

## ADR-045: With no legal move, the agent stops, and the orchestrating session overrides on record

**Context.** A forward move of `cycle_step` needs the matching `oid verify` on the current content, and sometimes no legal move exists (a fix that leaves every scenario green, a case ADR-038 and ADR-044 do not cover). Working around the hook, or mutating the source to force a Red, is what integrity must refuse. Asking the human to type a move the orchestrating agent already diagnosed puts on the human what they did not decide. The hook input tells a subagent from the main session: Claude Code adds `agent_id` for a subagent and leaves it out for the main session. This is about developing with an orchestrating agent (the bootstrap); `oid run` has to answer the same cases with legal moves of its own.
**Options.** (1) The human moves the step outside the hook: rejected, the human types what they did not decide. (2) The main session passes every check: rejected, a skipped check would leave no trace. (3) An explicit override, only from the main session, recorded: chosen.
**Decision.** An agent with no legal move stops and says why; a subagent reports to the orchestrating session. A Bash call from the main session may prefix an `oid verify` or `oid progress step` command with `OID_OVERRIDE="<cause>"`: the hook skips the integrity and evidence checks for that command and appends the date, the command and the cause to `.outside-in/overrides.ndjson` (local, git-ignored). The prefix from a subagent is refused. An override is the last resort: only when no legal move exists, never for what oid checks by itself (a return under ADR-038 or ADR-044, a `--decide`). A file the step does not allow is edited only together with the override that absorbs it. Afterwards the session re-verifies the content (`oid verify green`), mutation-checks any scenario that passed without a Red, and records each override in the bootstrap-log row of the feature. `oid progress revise` stays the human's, with or without the prefix.
**Consequences.** The human is asked only for what is theirs, and overrides are visible. Their count measures the cases with no legal move: one that repeats is a candidate for a legal move of its own, as ADR-038 and ADR-044 were.
**Scope.** A session that drives the cycle through oid's commands and hooks (today, oid's own development with Claude Code). Whether that mode is part of the product is open (design §20.2); `oid run` answers the same cases with legal moves of its own.

## ADR-046: The exit after a revise with no code is the orchestrating session's move, not an override

**Context.** The ADR-041 exit is a planned move that oid itself accepts only when its conditions hold. Counting it as an override would mix planned moves with the real gaps overrides are meant to show, and a subagent must not end a revise.
**Decision.** The hook lets `oid progress step <FR> quality_gate` from `bdd_red` through from the main session with no override, and refuses it from a subagent. oid still checks the conditions of ADR-041.
**Consequences.** Overrides stay the last resort, and the exit stays out of a subagent's reach.
**Scope.** A session that drives the cycle through oid's commands and hooks (today, oid's own development with Claude Code). Whether that mode is part of the product is open (design §20.2); `oid run` answers the same cases with legal moves of its own.

## ADR-047: `max_retries` counts retries after the first attempt, and 0 means fail fast

**Context.** `limits.max_retries` needs a meaning. A limit called "retries" counts the attempts after the first, and failure-path scenarios need the run to end at the first failed attempt.
**Options.** (1) `max_retries` = total attempts: rejected, the name says otherwise and 0 would make no sense. (2) Retries after the first attempt, asking when they run out even with 0: rejected, every first failure would ask. (3) Retries after the first attempt, and 0 = fail fast: chosen.
**Decision.** Attempts = `max_retries` + 1. Each intermediate attempt raises `thinkingLevel` by one level, up to `high`. The last attempt is always `models.strong` at `high`. With `max_retries: 0`, the first failure ends the run with its error and asks nothing; the run asks (FR-RUN-11) only when at least one retry was allowed and all were used. Until effort scoring exists, the first attempt uses `models.default` at `medium`.
**Consequences.** The default of 3 gives 4 attempts. Run scenarios set `max_retries: 0` to see a failure instead of a question.

## ADR-048: Providers, credentials and models belong to the user, set up with `oid setup`

**Context.** An `oid run` needs a provider, credentials and a model per agent role. A project is shared and committed, but the provider and the account belong to whoever runs oid: a project that names a provider forces it on every collaborator. Pi offers what a setup needs: `ModelRuntime.login(provider, "api_key" | "oauth", interaction)`, which runs the provider's own flow and stores the credential in a given `auth.json` (mode 0600, with Pi's lock), OAuth flows per provider, the `ModelRuntime` catalogue, and TUI components for login and model selection.
**Options.** (1) Models in the project, credentials by hand: rejected, the project would impose a provider. (2) User defaults with a project override: rejected, two places for one answer, and the override still imposes a provider. (3) Everything about providers and models is the user's, and one command sets it up: chosen.
**Decision.** Credentials and models are user configuration, never project configuration.
- Credentials live in the `auth.json` of oid's own `agentDir`, written through Pi's `ModelRuntime.login` (Pi does not export `AuthStorage`); provider variables still work as in Pi. oid never reads `~/.pi`; importing its credentials is an explicit option of `oid setup`.
- Models are assigned per role in `<config dir>/config.json`: `fast`, `default`, `strong`, `spec`, and later `decisions` for Jev. Each role is `provider/id`, with room for per-role options such as a pinned version.
- The config dir is `$OID_CONFIG_DIR`, else `$XDG_CONFIG_HOME/oid`, else `~/.config/oid`. The `agentDir` defaults to `<config dir>/agent`; `OID_AGENT_DIR` overrides it.
- `.outside-in.json` has no `models` key; a project that has one gets an error that names `oid setup`.
- `oid setup` writes this configuration; `oid init` offers it when it is missing; `oid doctor` only checks; `oid run` and `oid resume` check the same before they start and refuse with what is missing.
**Consequences.** A project runs with whatever account each user has. Jev becomes one more role, sharing the credential store.

## ADR-049: A scenario that passes at once can be accepted by the human as a guard

**Context.** Some scenarios describe what must not happen (no command configured, so nothing is invoked). Their steps pass before any code exists, so there is no Red, and no evidence can show that they check something.
**Options.** (1) Ask the agent for an assertion that fails without the code: rejected, it forces an implementation-specific check. (2) Skip it as `@wip`: rejected, the feature can then never be done. (3) Let the human accept it: chosen.
**Decision.** In `oid run`, a scenario that passes at BDD Red with no code of this cycle is put to the human with its step definitions. The human can accept it as a guard, with a reason: it is recorded as passing, with the reason as its evidence, and needs no unit test. Otherwise the usual actions apply. The agent can never accept it; for every other case, a scenario that passes at once is not a Red (ADR-038).
**Consequences.** The steps of a guard are checked only by the human's review; the reason is in the event log, for audit.
**Article.** Deviates from "every scenario starts Red": a scenario that passes at once can be a guard; `progress.json` carries the guard's reason, a field the article's schema does not have.

## ADR-051: The project's own conventions reach the agents through a configured file

**Context.** oid's prompts are generic: they explain BDD, TDD and oid's own rules, and stay stack-agnostic. Each project also has conventions no generic prompt can know, and that its reviews keep correcting. The example features and the step catalogue carry some by imitation, but not the reasons, and not what a feature or a test must not do.
**Options.** (1) Give the agents the project's `AGENTS.md` or `CLAUDE.md`: rejected, those files are written for an interactive session that orchestrates (hooks, overrides, progress commands), so they would tell oid's agents to do what oid does, and they are long. (2) Put the conventions in `DOMAIN.md`: rejected, the domain notes describe the domain and the external systems, and the agents that write code do not receive them. (3) A configured conventions file: chosen.
**Decision.** `paths.conventions` in `.outside-in.json` names zero or more files (none by default). Their text is given, under "Project conventions", to every agent that writes feature files, step definitions, unit tests or code (FEATURE_WRITE, BDD_RED, TDD_RED, CODE_GREEN, REFACTOR, QUALITY_FIX), within a size budget of its own (§11); past the budget the rest is left out and the prompt names the file, for the agent to read. The prompts present the conventions as the project's own rules, which take precedence over the generic guidance where they differ. The files are written by the people of the project; oid never writes them, and `oid init` does not create one. They are project files like `SPEC.md`: read, never secret, and subject to the same secret filter.
**Consequences.** A project can teach its agents what its reviews keep correcting, with the reasons, in one place. A convention that is wrong or out of date misleads every agent at once, so the file is reviewed like code.

## ADR-052: A release is installed with the exact dependency tree it was tested with

**Context.** ADR-003 pins Pi's four packages, but Pi's own dependencies use ranges, and a global install from the packed tarball does not use oid's lockfile: a transitive release that removed an export Pi imports broke a fresh install of oid while the repository, resolved through its lockfile, passed every test.
**Options.** (1) `overrides` in `package.json`: npm applies them only from the root project, not to a globally installed package. (2) Commit `npm-shrinkwrap.json` instead of `package-lock.json`: oid treats `package-lock.json` as a protected file and as the signal to install a worktree's dependencies with `npm ci`, so running oid on itself would lose both. (3) Ship the shrinkwrap and keep `npm install -g <tarball>`: tried, npm 10 ignores the shrinkwrap of a package installed globally from a local tarball. (4) Bundle the dependencies: a 57 MB tarball, and esbuild's install script fails on the bundled copy. (5) Ship the shrinkwrap, and install by unpacking the tarball into a directory of its own, running `npm ci --omit=dev` there and installing that directory globally.
**Decision.** (5). `prepack` copies `package-lock.json` to `npm-shrinkwrap.json`, `npm pack` includes it, and `postpack` removes it. `scripts/install-release.sh <tarball>` unpacks it under `~/.local/lib/oid/<name>` (or `$OID_RELEASES`), runs `npm ci --omit=dev` there, and runs `npm install -g` on that directory. A release is installed only through that script.
**Consequences.** An install of a given oid version is reproducible, Pi's transitive dependencies included, and it is still a packed build, not the working tree. Each release keeps its directory, which is also the way back. Moving a dependency is the routine of ADR-003: update the lockfile, run the full gate, release.

## ADR-053: Design documents and feature files are written in English

**Context.** A project's `SPEC.md`, `DOMAIN.md`, `DECISIONS.md` and feature files are the main input of every agent and of Jev. A shared or open-source project is written in English, and a second language for the same documents adds cases to test and a source of ambiguity for the agents.
**Options.** (1) A configured language for every generated artefact: rejected, for the reasons above. (2) English for the design documents only, the configured language for feature files and code: rejected, a feature file in another language breaks the vocabulary chain from the FR to the step and to the code. (3) English for the design documents, feature files, test names, code and comments; only test data in the end user's language: chosen.
**Decision.** In a project that uses oid, `SPEC.md`, `DOMAIN.md`, `DECISIONS.md`, feature files, test names, code and comments are in English. Test data inside scenarios and tests may be in the end user's language, since it exercises what a user really types. The conversation of `oid spec` may be in any language; the spec-agent writes the documents in English (§13).
**Consequences.** One language for the parsers, the prompts and Jev's questions. A team that does not write English can still talk to the spec-agent in its own language, but reads the documents in English. A rule on the style of these documents (a controlled subset of English, such as ASD-STE100) becomes possible, and is left for a later decision.

## ADR-054: The article and the design are a starting point, and they change through records

**Context.** oid is built to enforce the methodology of the article, and it is built with that methodology, so the implementation is also a test of the article's claims: it can confirm or refute them. Presenting the article and the design as fixed made agents work around contradictions instead of raising them, and made decisions pile up as amendments that had to be read in order to know the rule in force. Two rules were mixed: an agent implementing an FR must not diverge from the spec on its own, which is the methodology; and the project must be able to correct its design when the implementation shows it is wrong.
**Options.** (1) Fixed documents, changed only by new entries that amend the old ones: rejected, for the reasons above. (2) Let agents change the design when they find a problem: rejected, a design that changes without the human is no longer a contract. (3) Keep the design binding during a feature, with a recorded path to change it: chosen.
**Decision.**
- The article is the starting reference for the methodology and its artefacts. A deviation or an extension is allowed when the implementation gives evidence for it. The ADR that records it carries an **Article.** line naming the part of the article it changes, and its context holds the evidence. Those lines are what goes back to the article.
- `docs/design.md`, `DECISIONS.md` and `SPEC.md` describe what is in force, not how it came to be. A decision that changes is rewritten in place, or replaced by a new entry and removed; a number is never reused. The commit that changes them says why; git keeps every earlier version.
- During a feature, the spec, the design and the ADRs bind the agent that implements it: it does not diverge on its own. When it finds one of them wrong or contradicting the code, it stops and proposes the change, with the evidence. The human decides.
- A change follows one chain, in one `docs:` commit or in that commit and the next: the ADR (why), `docs/design.md` (what), and `SPEC.md` when behaviour changes, with `oid progress revise` run by the human for each FR whose passing scenarios no longer describe it (`docs/METHODOLOGY.md`, "Changing the design").
**Consequences.** A wrong design is corrected, with a record of why and of what it affects downstream, and a reader learns the rule in force from one entry. The bootstrap log can record which claims of the article the implementation confirmed or refuted.
**Scope.** How this project's documents and the article evolve; it binds the people and agents who build oid, not oid's behaviour.

## ADR-055: oid influences its agents through objective, focus, boundaries and constraints

**Context.** An agent is a complex system: it organises itself around its goal and its context, and a rule only governs what it reaches. This matches the agent design principles the author drew from building other agents before oid (identity and character, tool design, skill design, instruction delivery, permissions as design): tool output steers an agent more reliably than a rule in its prompt, a rule with its reason works as a value the agent can apply to cases it did not foresee, and compliance drops as the number of instructions grows. The runs of `oid run` are consistent with it, though they are one feature with several changes between runs, so they show a direction, not which change caused which number (the bootstrap log has the figures). The changes that coincided with fewer rejections, denials and blind retries were about what each agent sees: rejections that say what to do next, conventions and permissions with their reasons, examples chosen by relevance, and a legal path where there was none (the guard question). The worst behaviours (a fabricated Red, test-only code in the source, a finding hidden behind a constant named after its value) each came from a constraint that blocked the goal with no legal way forward. The same happened to the cycle itself: most of the ADRs about returns and overrides were legal paths added, one at a time, to dead ends that the per-step freezes created.
**Options.** (1) Control: describe each step in more rules, and add a rule or a path for every failure seen. Rejected, for the reasons above. (2) Influence: hold a few invariants strictly, shape the conditions of everything else, and let the how emerge.
**Decision.** oid fixes the **what** (the scenario, the test, the contract) and the **evidence** (what counts as done), and influences the rest.
- **Invariants, held strictly:** the contract the human approved (the specification and the feature files, approved scenarios and their assertions); the evidence (a real Red and a real Green, and checks that tell the truth); and safety (secrets, the user's working copy, git). Every other constraint must justify itself.
- **Four parameters:** the **objective** (the FR and the scenario, what and why, and the goal of the whole system, not only the local task); the **focus of attention** (what the agent sees: the context of its task, examples, catalogues, conventions, and the text of every rejection); the **boundaries** (paths and tools per state, the shell only for the agent that writes code, cost, turns, time and retries); the **constraints** (the gates, the shape of the tools, the report).
- **Six questions for every other constraint:** (1) does it serve the goal of the system, not a theory; (2) does it leave a legal path to the goal; (3) does it remove a decision the agent should not make, not its thinking; (4) can it live in the environment (a boundary, a tool, a message) rather than in a rule of the prompt; (5) does it restrain without forcing one single way; (6) is it measured, and changed when the measurement says so.
- **Feedback and reasons are structure, not style.** Every rejection, from a gate, `oid verify`, `oid try` or a hook, carries what failed, the evidence and the next action, in a typed shape every rejection path must fill (FR-AGENT-10). Every rule addressed to an agent carries its reason; a rule without one is missing its reason, or belongs in the environment, or goes.
- **The sequence of the cycle is kept, deliberately.** Scenario by scenario, a Red before each Green, is itself a constraint on the how. It stays the default because writing the test from the specification before the code does more than prove the test: it shapes the design and keeps tests from being fitted to the code, which is the core of outside-in. Where it blocks legitimate work (a Red that is impossible or artificial), the legal path is evidence by mutation, not another return (ADR-056). Whether a gate on the evidence of the outcome could replace part of the sequence is an open question, to answer with data.
**Consequences.** Every gate needs a legal way out: a gate that ends the run with no question is a gap to close. oid owns the whole prompt of its agents (ADR-008), so the number of its instructions is a design value, counted and kept low; prompts are environment, judged by runs, not contract (ADR-057). This decision is about the product; a session that drives the cycle through oid's commands and hooks follows it where it can, inside a system prompt oid does not control.
**Article.** Extends "Making agents follow the methodology": instructions are a start; guarantees come from the environment, and the environment is designed, not narrated.

## ADR-056: Where a Red is impossible, a mutant that oid applies is the evidence

**Context.** A Red stands for a property: the test can tell correct code from broken code. In three cases a Red is impossible or artificial: a scenario that passes before any code because it guards against something (ADR-049), a test or step fixed after the code exists, and behaviour an earlier scenario already implemented. ADR-038 and ADR-044 already check the property with one coarse mutant (removing this cycle's code), but it does not apply when the code that makes the test pass belongs to an earlier cycle; three such dead ends are still open (design §20.3). In the early bootstrap, agents verified such tests by breaking the code for a moment and restoring it; its illegal twin, moving code to get a Red and keeping it, is what integrity refuses. The difference is who applies the mutation, whether it is undone, and whether it is recorded. A guard accepted only by the human costs one human intervention per guard.
**Options.** (1) A new return rule for each dead end: rejected, it is the path-per-failure pattern of ADR-055. (2) Drop the Red and judge only the outcome: kept open (ADR-055). (3) Keep Red-first as the default, and accept a mutant as evidence where a Red is impossible: chosen.
**Decision.** Where a Red is impossible, the agent submits a mutant as a diff (in its report, or through `try`); it never writes it to the source. oid applies it, runs the test or scenario, requires that it fail **with an assertion of the test** (an import error, `ENOENT` or a `TypeError` proves only that the test touches the code), and restores the source itself; integrity then confirms the source is unchanged. The mutant must be small and touch code the test exercises. The diff is recorded as the evidence, as a guard's reason is today. For guards it starts in shadow mode: oid verifies the mutant, the human still accepts, and the record shows how often both agree before the human step is reconsidered. Requirements: FR-VERIFY-10 (fixed tests and steps), FR-RUN-13 (guards).
**Consequences.** The three open dead ends close without another return ADR. A guard's review becomes a three-line diff plus the scenario. Mechanical mutation operators, with no choice by the agent, are an alternative if agents choose weak mutants; they cost more per run. Red-first stays the default path.
**Article.** Extends "Tests can be wrong too" and the rule for guards: evidence by mutation where a Red is impossible.

## ADR-057: Prompts are environment, judged by runs

**Context.** Unit tests pin the wording of the agents' prompts, and every change of wording has been a full reopened FR cycle: of the last 64 rows of the bootstrap log, 59 are reopens and about 22 change prompt text. That treats prompts as a contract, while ADR-055 treats them as environment whose effect is measured. A record that undercounts overrides, leaves the health delta blank and omits the model and cost of runs cannot measure anything.
**Decision.**
- Unit tests check the mechanism of a prompt, not its words: the permissions text is generated from the profile, the conventions reach the prompt, a shared part appears once, every prompt ends with the report obligation.
- A change of wording only is a `tune(prompts)` commit, validated by a real run and recorded in the bootstrap log; it does not reopen an FR. A change of what a prompt is given (its context, its tools) is behaviour, and goes through its FR.
- Each state's prompt is a skill: its trigger is the state and its success criterion is the gate. It is reviewed against the skill checklist (design §7.9), not rewritten as goals.
- The record is fixed first: one definition of a human intervention and of an override, and the model, cost, time and health delta in every run's row (`docs/bootstrap-log.md`).
- Wording is judged on a small set of real runs over varied requirements, not on one.
**Consequences.** Tuning a prompt costs a run, not a feature cycle. The tests that pin wording are rewritten to check the mechanism.
**Scope.** The process of building oid, and how oid's own prompts are maintained.
