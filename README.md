# outside-in-dev

`oid` is a command-line harness that enforces the Outside-In Development methodology (Spec → BDD → TDD) on AI coding agents. The methodology is the control flow: a deterministic state machine decides the next step, and agents only write specs, tests and code inside that step.

The commands below are what oid can do on its own. [docs/METHODOLOGY.md](docs/METHODOLOGY.md) is how a feature is implemented in this repository. [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) is the order of the work that is still ahead.

The command to run is an installed build, not this working tree. `npm pack` prints the tarball name:

```
npm ci && npm run build && npm pack
npm install -g ./outside-in-dev-*.tgz
```

`oid --help` lists the commands. `oid <command> --help` lists one.

| Command | What it does |
|---------|----------------|
| `oid progress` | Read and update `progress.json`: `current`, `status`, `show`, `add`, `focus`, `step`, `scenario`, `done`. `status` lists features that are not done and counts the done ones; `status --all` lists every feature. |
| `oid check` | Check the specification, scenario traceability and progress. `--json` prints one JSON document. Exit 1 when something is wrong. |
| `oid init` | Detect a TypeScript project's paths and commands, write `.outside-in.json`, and ignore `.outside-in/`. Creates `progress.json` from `SPEC.md` when none exists. |
| `oid init --import-progress [path]` | Convert a progress file from an earlier schema and list what could not be carried over. |
| `oid verify red` | Decide whether a unit test (`"<file> > <name>"`) or a scenario (`<file>:<line>`) is a valid Red. Exit 2 when it needs a decision; answer with `--decide <class>`. |
| `oid verify green` | Run the unit suite and the scenarios that were passing, and report regressions and new type errors in source. |
| `oid verify integrity` | Report changes outside the paths of the current step, and forbidden patterns. `--step` checks another step. |
| `oid metrics` | Report code-health findings. `--changed` keeps only findings on lines changed since the last commit that the baseline does not already hold, and exits 1 when one remains. `--baseline` records the current findings as existing debt. |

## Documentation

| File | What it is |
|------|------------|
| [SPEC.md](SPEC.md) | What to build: goal, MVP, requirements |
| [DOMAIN.md](DOMAIN.md) | Vocabulary, data formats, observed tool behaviour |
| [DECISIONS.md](DECISIONS.md) | Settled architecture decisions |
| [docs/design.md](docs/design.md) | Technical design |
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | How to implement a feature here |
| [AGENTS.md](AGENTS.md) | Rules for agents working in this repository |

Methodology reference: [Outside-In Development](https://ai.juanjeojeda.com/outside-in-development).

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
