# outside-in-dev

`oid` is a command-line harness that enforces the Outside-In Development methodology (Spec → BDD → TDD) on AI coding agents. The methodology is the control flow: a deterministic state machine decides the next step, and agents only write specs, tests and code inside that step.

The commands below are what oid can do on its own. [docs/METHODOLOGY.md](docs/METHODOLOGY.md) is how a feature is implemented in this repository. [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) is the order of the work that is still ahead.

The command to run is an installed build, not this working tree. `npm pack` prints the tarball name, and `scripts/install-release.sh` installs it with the exact dependencies it was tested with (ADR-052):

```
npm ci && npm run build && npm pack
scripts/install-release.sh ./outside-in-dev-*.tgz
```

`oid --help` lists the commands. `oid <command> --help` lists one.

| Command | What it does |
|---------|----------------|
| `oid progress` | Read and update `progress.json`: `current`, `status`, `show`, `add`, `focus`, `unfocus`, `step`, `scenario` (and `scenario drop` for a pending one), `done`, `revise` (a changed requirement: back to `bdd_red`, scenarios `pending`; the human runs it) and `reopen` (a review on a done feature: back to `quality_gate`, scenarios kept). `status` lists features that are not done and counts the done ones; `status --all` lists every feature. |
| `oid check` | Check the specification, scenario traceability and progress. `--json` prints one JSON document. Exit 1 when something is wrong. |
| `oid init` | Detect a TypeScript project's paths and commands, write `.outside-in.json`, and ignore `.outside-in/`. Creates `progress.json` from `SPEC.md` when none exists. |
| `oid init --import-progress [path]` | Convert a progress file from an earlier schema and list what could not be carried over. |
| `oid verify red` | Decide whether a unit test (`"<file> > <name>"`) or a scenario (`<file>:<line>` or `"<scenario name>"`) is a valid Red. Exit 2 when it needs a decision; answer with `--decide <class>`. A step or unit test fixed after the code exists returns the feature to where it came from once oid has proved the fix (ADR-038, ADR-044). |
| `oid verify green` | Run the unit suite, the scenarios that were passing of the feature in focus and of the targets' features, and the scenarios given as targets (`<file>:<line>` or `"<scenario name>"`, several at once), and report regressions and new type errors in source. A green records the checkpoint of the feature in focus and of each target's feature: it is the evidence `oid progress scenario pass` and `oid progress done` require. |
| `oid verify integrity` | Report changes since the checkpoint of the focused feature outside the paths of the current step, and forbidden patterns. `--step` checks another step. |
| `oid metrics` | Report code-health findings. `--changed` keeps only findings on lines changed since the last commit that the baseline does not already hold, and exits 1 when one remains. `--baseline` records the current findings as existing debt. |
| `oid try` | Run one unit test or scenario, then the type check and the linter on the changed files, and print a short verdict. Records nothing. |
| `oid setup` | Set up your providers, credentials and a model per role (fast, default, strong, spec). User configuration, never the project's. |
| `oid doctor` | Check, without changing anything, that oid can run here; `--connect` makes one minimal call per provider. |
| `oid run` | Run the cycle on the pending features (or `--fr` the given ones) in a worktree of its own, and deliver a branch with one commit per feature. |
| `oid resume` · `oid abort` | Continue a stopped run · stop the running one after its current step. |

## Documentation

| File | What it is |
|------|------------|
| [SPEC.md](SPEC.md) | What to build: goal, MVP, requirements |
| [DOMAIN.md](DOMAIN.md) | Vocabulary, data formats, observed tool behaviour |
| [DECISIONS.md](DECISIONS.md) | The architecture decisions in force, and why |
| [docs/design.md](docs/design.md) | Technical design |
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | How to implement a feature here |
| [AGENTS.md](AGENTS.md) | Rules for agents working in this repository |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | How features, steps, tests and code are written here |
| [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) | How oid takes over its own development, and what is next |

Methodology reference: [Outside-In Development](https://ai.juanjeojeda.com/outside-in-development).

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
