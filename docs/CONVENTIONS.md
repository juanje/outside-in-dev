# Conventions of this project

These are the rules this project's reviews keep correcting, with the reason for each. They come before any general guidance where the two differ. The first part holds for any project on this stack (TypeScript, cucumber-js, vitest); the second is particular to this project.

## Stack: TypeScript, cucumber-js and vitest

- **A step definition imports code that does not exist yet with a dynamic `import()` inside the step**, never at the top of the file. A static import of a missing module stops cucumber before any scenario runs, so every other scenario fails too.
- **vitest reports a missing export as `TypeError: (0 , name) is not a function`**, not as an import error. That failure means the function does not exist yet.
- **cucumber-js 13 has no `json` or `junit` formatter.** Reports are read from `--format message:<file>`.
- **A test that reads something the code must produce (a file, a record, a value) first asserts that it exists.** Then the missing behaviour fails as an assertion, which oid classifies as a valid Red by itself, and not as a runtime error such as `ENOENT`, which needs someone to decide.
- **A failing test is never rewritten to fit the code** (`not.toThrow`, a weaker assertion, a deleted check). If the test is wrong, say so in your report.
- **A test that writes a program to disk (a fake command, a small script) holds code inside code, and escapes are easy to get wrong.** Write that program as a template literal with real line breaks, not as lines joined with "\n": one escape too many writes a backslash and an "n" instead of a line break, the script is invalid, it records nothing, and the test then fails exactly as if the code were missing. It looks like a valid Red that no code can ever make pass.
- **A Given that sets up state the system itself writes (a session, an event log, a saved file) builds it with the system's own code or a recording of a real one, never by hand:** a hand-made state can miss what every real one contains.

## This project

### Feature files and step definitions

- **A scenario that runs `oid run` or `oid resume` starts from the run fixture.** Its Background is the one of `features/run-09.feature` and most other `run-*` features: a git project with a green suite whose BDD scenario "Add to cart" passes, the cart requirements `FR-CART-01` (done) and `FR-CART-02` (pending) in `SPEC.md` and `progress.json`, and scripted agents ("the feature-writing agent writes …", "the step-writing agent writes …", "the test-writing agent writes …", "the coding agent writes …"). The agents of a run are scripted and the test runners replay recorded reports, so a scenario of a run takes seconds and costs nothing. A scenario that invents its own run setup needs a new fixture that nobody has.
- **A scenario of a run checks a milestone, not where the run ends.** A milestone is a transition in the event log, a checkpoint commit, a value in the saved session, a file in the worktree or a value a command received. The exit code, the last line of the output and the final state are where the run ends, and a later requirement that makes the run go further changes them, which breaks the scenario for no reason. The one exit code worth checking is that of a command refused before any run starts (a second run while one holds the lock, a project that is not set up): nothing later moves it, and it is part of the command's contract.
- **A failure that must end the run at once sets the retries to 0** ("the project allows 0 retries for each state"). Otherwise the run retries the failing state and then asks the human, and the scenario sees the question instead of the failure.
- **A scenario runs in-process.** Tag a single scenario `@process` only when it needs a real process (a signal, a real exit, a terminal); never tag the Feature. A real process costs seconds per scenario.
- **One real test runner per run state; the other scenarios replay a recorded report.** A replay names the request it answers (the test file and name, or the scenario locations) and fails on an unexpected request or when its sequence runs out; an entry answers more than once only with `repeat: true`. The scenarios that use a real runner are listed in `features/support/real-runners.ts`, and a unit test checks that each still exists: renaming one means updating that list.
- **A Then step checks what it names, not that nothing else happened**, unless its text says "only" or "nothing else". "The event log records an error" means an error is among the events; a step that checks the error is the only event breaks as soon as another step of the same scenario needs a second event, and the scenario can then never pass. Before you copy an existing step that checks an exact list, read the other Then steps of your scenario.

### Unit tests and code

- **A command that records how it was run (a fake notification command, for example) comes from `createRecordingCommand` in `features/support/recording-command.ts`**, for unit tests and steps alike: it records the arguments and the environment of each run and can fail with a given exit code, so no test needs to write that script again.
- **Nothing outside `src/cli.ts` reads `process` globals** (`process.env`, `process.cwd()`, `process.exit`, `process.stdout`). They come in as arguments, so the code runs in-process in the tests.
- **Pi's `prompt()` and `classify()` resolve even when the provider failed.** Check `stopReason` on `message_end`.
- **Pi's `tools` and `customTools` come from one array.** A custom tool missing from the allowlist is never offered, and nothing reports it.
- **Every Pi session is given oid's `agentDir`.** Without it Pi reads the user's personal settings.
