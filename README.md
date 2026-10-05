# outside-in-dev

`oid` is a command-line harness that enforces the Outside-In Development methodology (Spec → BDD → TDD) on AI coding agents. The methodology is the control flow: a deterministic state machine decides the next step, and agents only write specs, tests and code inside that step.

This repository is at the design and bootstrap stage. There is no behaviour yet. [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) is the order of work.

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
