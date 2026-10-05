# Domain

Context an agent cannot discover from the code: vocabulary, data formats, and how the external systems oid depends on actually behave. Everything under "External behaviour" was observed, not assumed (Pi 1.0.0, cucumber-js 13, vitest 3). The pinned Pi release is 1.0.3. Buddy's lockfile runs 1.0.1 and already confirms session isolation, `beforeToolCall` blocking, the single tool array and `session.abort()` (`docs/BOOTSTRAP.md`, spike S1). S1 on 1.0.3 rechecks the bad-key `stopReason` and the `SessionManager.create(cwd, dir)` signature.

## Glossary

### The methodology

- **FR / NFR.** Functional and non-functional requirement in `SPEC.md`, identified by `FR-AREA-NN` or `NFR-NN`. States what and why; never how to verify it.
- **Scenario.** A Gherkin `Scenario` in a `.feature` file, tagged with the FR it verifies (`@FR-AREA-NN`, possibly inherited from the `Feature`). The acceptance criterion of an FR.
- **Step definition.** TypeScript code that executes a Gherkin step with real assertions.
- **Outer loop.** One iteration per scenario: make it fail (BDD Red), then drive it to pass.
- **Inner loop.** One iteration per unit of logic: one failing unit test (TDD Red), the minimum code to pass it (Green), refactor.
- **Valid Red.** A test that runs and fails because the behaviour does not exist yet or is wrong. Not a valid Red: a test that passes, does not load, has undefined or pending steps, or fails because the test itself is broken.
- **Quality gate.** The set of binary checks (format, lint, types, unit, BDD, extra checks, traceability) that defines "done" for a feature.
- **Traceability.** Every behaviour traces to a scenario, every scenario to an FR.

### The harness

- **Run.** One execution of `oid run` (or `oid tidy`), with its own id, worktree, branch and event log.
- **State.** A node of oid's state machine (`BDD_RED`, `CODE_GREEN`…). Finer than the progress file's `cycle_step`.
- **Gate.** The deterministic condition a state must satisfy to move on.
- **Checkpoint.** A commit on the run's branch created when a state passes its gate. Rollback target for failed attempts.
- **Attempt.** One agent session trying to pass a state's gate. Failed attempts are rolled back and retried with the reason, up to a limit.
- **Agent role.** spec-agent, bdd-agent, tdd-agent, coder-agent. A role plus a state gives a **profile**: tools, readable paths, writable paths.
- **Report.** The structured result every agent session must end with (`done` with files, or `blocked` with a reason).
- **Integrity violation.** A change outside the paths allowed for the state, a change to an approved feature file, or a forbidden pattern in added lines.
- **Input request.** A question to the human (`WAITING_INPUT`), with a fixed set of actions.
- **Baseline / frozen debt.** Errors and findings that existed when the run started. Gates judge only what the run adds.
- **Decision.** One call to the decision model with a shared state and one or more typed questions.
- **Finding.** One result of a refactor detector: category, location, symbol, detail, related locations.
- **Item.** A group of findings fixed together by one agent and committed (or rolled back) together.
- **Reuse catalogue.** The list of the project's exported symbols with signatures and one-line docs, given to implementation agents.
- **Health metrics.** Duplication percentage, maximum and mean complexity, unused exports and files, magic values, documentation drift.
- **Golden run.** A real run on a small reference project, used to detect regressions in prompts and calibrate thresholds.

### Refactor scales

| Scale | When | Scope |
|:--|:--|:--|
| Micro (`REFACTOR`) | After each Green | Lines changed since the last checkpoint; source only |
| Meso (`FR_REFACTOR`) | When all scenarios of an FR pass | The FR's whole diff, tests, steps and docs included; duplication with the rest of the code |
| Macro (`oid tidy`) | On demand, or proposed by triggers | The whole project, existing debt included |

### Red classes

| Class | Valid Red | Typical cause |
|:--|:--|:--|
| `business_assertion` | Yes | An assertion about behaviour fails |
| `missing_implementation` | Yes | The module or function under test does not exist yet |
| `test_bug` | No | Syntax error, undefined step, test passes without new code, test breaks something else |
| `environment` | No | Missing external package, misconfigured runner |

## Data formats

### `progress.json` (article schema, no other fields)

```json
{
  "current_focus": "FR-PROG-01",
  "features": [
    {
      "id": "FR-PROG-01",
      "title": "Show progress",
      "status": "in_progress",
      "cycle_step": "tdd_green",
      "scenarios": [
        { "name": "Current shows the focused feature", "bdd": "fail" },
        { "name": "Status lists every feature", "bdd": "pending" }
      ]
    },
    { "id": "FR-PROG-02", "title": "Add a feature", "status": "pending" }
  ]
}
```

- `status`: `pending`, `in_progress`, `done`.
- `cycle_step`: `select`, `bdd_red`, `tdd_red`, `tdd_green`, `refactor`, `quality_gate`. Present only on started features; removed when done.
- `scenarios[].bdd`: `pending`, `fail`, `pass`.
- Valid transitions: `select → bdd_red → tdd_red → tdd_green → refactor`; from `refactor` (or directly from `tdd_green`) to `tdd_red` (scenario still red), `bdd_red` (next scenario) or `quality_gate` (all scenarios pass). Anything else is rejected.
- `done` requires at least one scenario and every scenario in `pass`.

### `SPEC.md` requirement headings

```markdown
### FR-PROG-01: Show progress
### NFR-01: Deterministic first
```

Patterns: `^### (FR-[A-Z][A-Z0-9]*-\d{2,3}[a-z]?): (.+)$` and `^### (NFR-\d{2,3}): (.+)$`. The body runs to the next heading of level 3 or above. An FR id may end in one lowercase letter (`FR-PERM-06b`): a requirement split off an existing one keeps its number. Level-2 headings are free text and ignored. A requirement must not contain acceptance criteria: a Gherkin-style sequence (a line starting with `Given`, plain, bulleted or bold, followed later by one starting with `Then`) or a `Scenario:` line. An ordinary sentence that starts with "When" is not one.

### Feature file

```gherkin
@FR-PROG-06
Feature: Mark a feature done

  Scenario: A feature with a failing scenario cannot be done
    Given a tracked feature "FR-X-01" with a scenario "S1" marked "fail"
    When I run "oid progress done FR-X-01"
    Then the command fails explaining that "S1" is not passing
    And "FR-X-01" is still in progress
```

One file per FR, tag on the `Feature`. Scenarios describe observable behaviour, not implementation (no internal function names, no file layouts the user does not see).

### Finding

```json
{
  "id": "dup-0007",
  "category": "duplication",
  "file": "src/progress/load.ts",
  "range": { "start": 12, "end": 31 },
  "detail": "20 duplicated lines",
  "related": [{ "file": "src/check/load.ts", "range": { "start": 8, "end": 27 } }]
}
```

Categories: `complexity`, `duplication`, `dead_code`, `magic_value`, `doc_drift`.

### Classifier questions (Pi `classify()`)

```typescript
{ type: "choice", instructions, criteria: { business_assertion: "…", test_bug: "…" } }  // → choice, probabilities, confidence
{ type: "score",  instructions, criteria: ["trivial", "simple", "moderate", "complex", "algorithmic"] }  // → score, confidence
{ type: "bool",   instructions, criteria: { true: "…", false: "…" } }  // → probability (Jev calls it "noul")
```

All questions of one call share one `state` object. Criteria always carry descriptions: bare labels give worse calibration.

## External behaviour

### Pi SDK 1.0.3

Observed on 1.0.0. Buddy runs 1.0.1 with the same session shape. The pin is 1.0.3; S1 rechecks the bad-key `stopReason` and `SessionManager.create(cwd, dir)` on that pin.

- `await session.prompt(…)` resolves the same way when the model worked and when the provider failed. Errors arrive as an assistant `message_end` with `stopReason: "error"` and `errorMessage`. An empty assistant response is also possible. Neither is success.
- `classify()` behaves the same: it resolves with `stopReason: "error"` instead of rejecting.
- `tools` (allowlist of names) also filters `customTools`. A custom tool missing from the allowlist is silently never offered.
- `session.agent.beforeToolCall` can block a call by returning `{ block: true, reason }`; the reason reaches the model as the tool result. Pi's extensions are installed on the same hook, so oid must chain to the previous handler.
- `tool_execution_end` carries no `args` (only `toolCallId`, `toolName`, `result`, `isError`); pair it with `tool_execution_start` by `toolCallId`.
- Without an explicit `agentDir`, the settings manager reads the user's `~/.pi/agent/settings.json`.
- Thinking levels: `off`, `minimal`, `low`, `medium`, `high`.
- Usage per assistant message: `message.usage.totalTokens` and `message.usage.cost.total` on `message_end`.
- `InteractiveMode` (exported) takes an `AgentSessionRuntime` and calls `process.exit` when the user quits. Inside it, the runtime can replace the active session (`/new`), dropping hooks installed by hand; extensions survive.

### cucumber-js 13

- Built-in formatters: `message`, `html`, `pretty`, `progress`, `progress-bar`, `summary`. No `json`, no `junit`.
- `--format message:<file>` writes Cucumber Messages as NDJSON. Each `testStepFinished.testStepResult.status` is one of `PASSED`, `FAILED`, `UNDEFINED`, `PENDING`, `AMBIGUOUS`, `SKIPPED`; failures carry `exception.type` and `exception.message`.
- Observed for a step that dynamically imports a missing module: `FAILED`, `Error: Cannot find module '<absolute path>'`. Following steps are `SKIPPED`.
- Observed for a step with no definition: `UNDEFINED`.
- Observed for a failing `node:assert` in a step: `FAILED`, `AssertionError: Expected values to be strictly equal: 2 !== 4`.
- **A step file that statically imports a module that does not exist stops cucumber-js before any scenario runs**: `ERR_MODULE_NOT_FOUND` on stderr, exit 1, and no message file at all. Previously passing scenarios do not run either.
- Scenarios are selected by location: `features/x.feature:12`.
- TypeScript steps need `NODE_OPTIONS="--import tsx"`.

### vitest 3

With `--reporter=json --outputFile=<file>`:

| Case | Where it appears | Observed message |
|:--|:--|:--|
| Test imports an export that does not exist | Test level, `failureMessages` | `TypeError: (0 , generateCode) is not a function` |
| Test imports a module that does not exist | File level, `message`, no tests listed | `Cannot find module '../../src/redirect' imported from '<test file>'` |
| Syntax error in a test file | File level, `message`, no tests listed | `Transform failed with 1 error: … ERROR: Unexpected …` |
| Failing expectation | Test level, `failureMessages` | `AssertionError: expected 2 to be 4 // Object.is equality` |

A missing export does not fail the file load: it arrives as `undefined`. Whether a `not a function` error is a valid Red depends on whether the name exists in the project, which only the compiler API can answer.

vitest does not type-check. Type errors are found by `tsc --noEmit`.

### git

- `git checkout -- .` does not remove untracked files. Rollback needs `git reset --hard <checkpoint>` plus `git clean -fd -- <writable paths>`.
- Worktrees share the object store; `node_modules` is not shared unless linked.

## Edge cases to keep in mind

- A test that passes before any implementation is not a Red, even if it looks reasonable: it verifies nothing new.
- A test whose only assertion is that something is defined, or that something does not happen, is suspect. The second kind has pinned defects in place as if they were requirements.
- An inner loop can end with every unit test green and the scenario still red: the missing piece is wiring, not logic. That is allowed only after the scenario has at least one unit test.
- An agent can make the suite green by skipping tests (`.only`, `.skip`) or by making code behave differently under test (`process.env.VITEST`). Both are integrity violations.
- A refactor can make a test simpler and stop it from testing anything. A refactored test must still fail against the code from before its feature.
- Extracting a helper used once adds indirection. A new exported symbol needs two references.
- oid working on its own repository must run from an installed build: the code it changes is not the code that runs it.
