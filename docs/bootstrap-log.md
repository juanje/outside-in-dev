# Bootstrap log

One row per FR. "Built with": `claude-code` or `oid run`. Health delta: change in `oid metrics` (once FR-MET exists). See `docs/BOOTSTRAP.md`.

| FR | Built with | Retries | Human interventions | Cost | Time | Health delta | Notes |
|:--|:--|:--|:--|:--|:--|:--|:--|
| FR-PROG-01 | claude-code | 0 | 0 | — | — | — | current, status and show; BDD runs the CLI as a subprocess |
| FR-PROG-02 | claude-code | 0 | 0 | — | — | — | add checks tracked ids and SPEC.md headings; atomic save |
| FR-PROG-03 | claude-code | 0 | 0 | — | — | — | focus never changes status |
| FR-PROG-04 | claude-code | 0 | 0 | — | — | — | transition table; pending starts with select |
| FR-PROG-05 | claude-code | 0 | 0 | — | — | — | scenario upserts bdd status; pending features refused |
| FR-PROG-06 | claude-code | 0 | 0 | — | — | — | done requires all scenarios passing; clears focus |
| FR-PROG-07 | claude-code | 0 | 0 | — | — | — | hand-written schema validator on the single load/save path |
| FR-CHECK-01 | claude-code | 0 | 1 | — | — | — | SPEC.md parser shared with progress; a stray scenario recorded by a grep was undone by restoring progress.json and replaying via oid progress |
| FR-CHECK-02 | claude-code | 0 | 0 | — | — | — | gherkin AST tags (feature+rule inherited); NFR headings join the shared SPEC parser, progress add still FR-only |
| FR-CHECK-03 | claude-code | 0 | 0 | — | — | — | consistency rules over effective-tag scenario list (listScenarios shared with traceability); invalid or malformed progress.json reported, missing one skipped |
| FR-CHECK-04 | claude-code | 0 | 0 | — | — | — | runCheck returns the exit code and builds one violation list (spec, traceability, progress) rendered as text or JSON; one extra unit test was written in a tdd_red step |
| fix: FR-PROG-07 | claude-code | 0 | 0 | — | — | — | non-object entries (document, feature, scenario, scenarios, scenario name) reported as schema violations instead of TypeError |
| fix: FR-CHECK-04 | claude-code | 0 | 0 | — | — | — | missing SPEC.md reported as a spec violation and Gherkin syntax errors as traceability violations instead of crashing; one unit test added after its code (message format), verified red by reverting |
| fix: FR-PROG-01 | claude-code | 0 | 0 | — | — | — | unknown or missing command/subcommand and missing arguments rejected with exit 1 and usage (FR-PROG-01..06); one constant drives dispatch and the error message; the missing-subcommand unit test was written after its code (verified red by mutation) |
| fix: FR-PROG-01 | claude-code | 0 | 0 | — | — | — | broken pipe on stdout (EPIPE) exits quietly instead of printing a stack trace; stream glue in src/cli.ts driven by the BDD scenario only, no unit test |
| fix: FR-CHECK-04 | claude-code | 0 | 0 | — | — | — | EPIPE handler no longer forces exit 0, so a failing command piped to a closing reader keeps its exit code; stream glue in src/cli.ts driven by the BDD scenario only, no unit test; the status-exits-0 scenario was green from the start (regression guard) |
| fix: FR-PROG-07 | claude-code | 0 | 0 | — | — | — | unknown fields inside scenarios rejected through the existing unknown-field helper (scenario field list added); one unit test |
| fix: FR-PROG-07 | claude-code | 0 | 0 | — | — | — | FR ids accept one optional lower-case letter (ADR-026) through one shared pattern used by the progress schema and the SPEC.md parser; two unit tests; scenarios tagged FR-PROG-02, FR-PROG-07, FR-CHECK-01, FR-CHECK-02; the two rejection scenarios were green from the start (guards) |
| FR-INIT-01 | claude-code | 0 | 0 | — | — | — | oid init detects stack, paths and commands into a Zod-validated .outside-in.json (zod 4.6.5) and ignores .outside-in/; atomic write extracted from saveProgress and reused; 17 scenarios, 18 unit tests added; the chained-scripts and several config-file-name cases were green by construction (guards or verified red by mutation); two unit tests were written together once; validation wiring in init is not demanded by a failing test |
| FR-INIT-02 | claude-code | 0 | 0 | — | — | — | oid init creates progress.json from the FR headings of SPEC.md (pending, specification order, titles as written) through the existing saver; existing file left untouched, missing SPEC.md and duplicate-id/empty-title reported; 6 scenarios, 5 unit tests added; the first green kept existing init tests passing by skipping a missing SPEC.md, whose message was then driven by its own test; the empty-title test failed on the schema message first, the blocking-problem filter was widened in green; initialiseProgress extracted in refactor |
| FR-INIT-03 | claude-code | 0 | 0 | — | — | — | oid init --import-progress converts progress.json in place through a pure convertProgress (statuses, cycle steps, pending/done cleanup, dropped fields and focus, each listed one per line) and leaves an already-current file untouched; 11 scenarios, 19 unit tests added (16 on the pure conversion, 3 on the command); the focus-kept and already-current scenarios were strengthened before code; two scenario fixtures/assertions were corrected after the first green run (a pending fixture carried a cycle_step that is rightly listed; "does not contain FR-DEMO-02" matched a note value); a failing validation of the converted file would happen after the config is written |
