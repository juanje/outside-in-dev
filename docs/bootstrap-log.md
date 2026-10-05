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
