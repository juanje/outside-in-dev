@FR-INIT-05
Feature: Check the setup

  `oid doctor` says, without changing anything, whether oid can run here: the tools the project's commands
  need, a model for every role, each model in Pi's catalogue and a credential for the provider of each role.
  `oid run` and `oid resume` make the same checks before they start, and refuse with what is missing and the
  command that fixes it.

  Scenario: A complete setup is reported ok, line by line
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5", "spec": "openrouter/anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And oid holds the API key "sk-test-openrouter-0815" for "openrouter"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    When I run "oid doctor"
    Then the command succeeds
    And the output reports "tool node" as ok
    And the output reports "model fast" as ok
    And the output reports "model default" as ok
    And the output reports "model strong" as ok
    And the output reports "model spec" as ok
    And the output reports "credential for anthropic" as ok
    And the output reports "credential for openrouter" as ok
    And the output does not report anything as missing
    And nothing the command printed contains "sk-test-anthropic-4711"
    And nothing the command printed contains "sk-test-openrouter-0815"

  Scenario: Doctor changes nothing
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    When I run "oid doctor"
    Then the command succeeds
    And the directories of the user's setup hold only the configuration and the credentials the user made
    And the project has no directory ".outside-in"

  Scenario: A user who has not set up oid is told to run oid setup, and nothing is created
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    When I run "oid doctor"
    Then the command fails
    And the output reports "model fast" as missing, fixed by "oid setup"
    And the output reports "model default" as missing, fixed by "oid setup"
    And the output reports "model strong" as missing, fixed by "oid setup"
    And nothing of oid's configuration was written
    And the project has no directory ".outside-in"

  Scenario: A model that is not in Pi's catalogue is reported with the command that assigns another
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/no-such-model", "strong": "no-such-provider/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    When I run "oid doctor"
    Then the command fails
    And the output reports "model fast" as ok
    And the output reports "model default" as missing, fixed by "oid setup --model default=provider/id"
    And the output reports "model strong" as missing, fixed by "oid setup --model strong=provider/id"

  Scenario: A provider with no credential is reported with the command that stores one
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5", "spec": "openrouter/anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    When I run "oid doctor"
    Then the command fails
    And the output reports "credential for anthropic" as ok
    And the output reports "credential for openrouter" as missing, fixed by "oid setup --provider openrouter"
    And nothing the command printed contains "sk-test-anthropic-4711"

  Scenario: A credential that comes from the provider's environment variable counts, and its value is never printed
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the environment variable "ANTHROPIC_API_KEY" holds "sk-env-anthropic-9"
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    When I run "oid doctor"
    Then the command succeeds
    And the output reports "credential for anthropic" as ok
    And nothing the command printed contains "sk-env-anthropic-9"
    And the directories of the user's setup hold only the configuration and the credentials the user made

  Scenario: A tool that a configured command needs is reported when it is not installed
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And a project that configures the commands "NODE_ENV=test no-such-tool-4711 run", "node bdd.mjs" and "node check.mjs"
    When I run "oid doctor"
    Then the command fails
    And the output reports "tool no-such-tool-4711" as missing, fixed by ".outside-in.json"
    And the output reports "tool node" as ok

  Scenario: A directory without the project's configuration is told to run oid init
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    When I run "oid doctor"
    Then the command fails
    And the output reports "project" as missing, fixed by "oid init"
    And the output reports "model fast" as ok

  Scenario: Without --connect, no provider is called
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    And the providers answer a minimal call:
      | provider  | stopReason | message |
      | anthropic | stop       |         |
    When I run "oid doctor"
    Then the command succeeds
    And no provider was called

  Scenario: With --connect, each provider gets one minimal call, however many roles use it
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5", "spec": "openrouter/anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And oid holds the API key "sk-test-openrouter-0815" for "openrouter"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    And the providers answer a minimal call:
      | provider   | stopReason | message |
      | anthropic  | stop       |         |
      | openrouter | stop       |         |
    When I run "oid doctor --connect"
    Then the command succeeds
    And the providers called were "anthropic" and "openrouter"
    And each provider was called once
    And the output reports "connect anthropic" as ok
    And the output reports "connect openrouter" as ok

  Scenario: A provider that answers with an error is reported with its message and never with the key
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    And the providers answer a minimal call:
      | provider  | stopReason | message                                        |
      | anthropic | error      | 401 invalid x-api-key sk-test-anthropic-4711   |
    When I run "oid doctor --connect"
    Then the command fails
    And the output reports "connect anthropic" as failed, saying "401 invalid x-api-key"
    And nothing the command printed contains "sk-test-anthropic-4711"

  Scenario: A provider with no credential is not called
    Given a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5", "spec": "openrouter/anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And a project that configures the commands "node unit.mjs", "node bdd.mjs" and "node check.mjs"
    And the providers answer a minimal call:
      | provider   | stopReason | message |
      | anthropic  | stop       |         |
      | openrouter | stop       |         |
    When I run "oid doctor --connect"
    Then the command fails
    And only the provider "anthropic" was called
    And the output reports "credential for openrouter" as missing, fixed by "oid setup --provider openrouter"

  Scenario: oid doctor --help shows its usage and its option
    When I run "oid doctor --help"
    Then the command succeeds
    And the output contains "usage: oid doctor"
    And the output describes the option "--connect"

  Scenario: oid run refuses to start for a user who has not set up oid, and creates nothing
    Given a git project with a green suite
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json tracks "FR-CART-01" as done and "FR-CART-02" as pending
    And a user who has not set up oid
    And the environment holds no key for any provider
    And oid checks the user's setup before it runs a scripted agent
    When I run "oid run"
    Then the process exits with code 1
    And the error mentions "model fast"
    And the error mentions "oid setup"
    And no worktree or branch was created
    And the project has no lock file
    And the project has no directory ".outside-in"

  Scenario: oid run lists every provider that has no credential, with the command for each, before it starts
    Given a git project with a green suite
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json tracks "FR-CART-01" as done and "FR-CART-02" as pending
    And a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5", "spec": "openrouter/anthropic/claude-opus-5" } }
      """
    And the providers answer a minimal call:
      | provider   | stopReason | message |
      | anthropic  | stop       |         |
      | openrouter | stop       |         |
    And oid checks the user's setup before it runs a scripted agent
    When I run "oid run"
    Then the process exits with code 1
    And the error mentions "credential for anthropic"
    And the error mentions "oid setup --provider anthropic"
    And the error mentions "credential for openrouter"
    And the error mentions "oid setup --provider openrouter"
    And no worktree or branch was created
    And the project has no lock file
    And no provider was called

  Scenario: oid run refuses to start when a tool of the project is missing
    Given a git project with a green suite
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json tracks "FR-CART-01" as done and "FR-CART-02" as pending
    And the project's unit command is "no-such-tool-4711 run"
    And a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And oid checks the user's setup before it runs a scripted agent
    When I run "oid run"
    Then the process exits with code 1
    And the error mentions "tool no-such-tool-4711"
    And no worktree or branch was created

  Scenario: oid resume refuses in the same way, before it looks for a saved run
    Given a git project with a green suite
    And a user who has not set up oid
    And the environment holds no key for any provider
    And oid checks the user's setup before it runs a scripted agent
    When I run "oid resume"
    Then the process exits with code 1
    And the error mentions "model fast"
    And the error mentions "oid setup"
    And the error does not mention "no run to resume"
    And the project has no lock file

  Scenario: A complete setup does not stop oid run
    Given a git project with a green suite
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json tracks "FR-CART-01" as done and "FR-CART-02" as pending
    And a user who has not set up oid
    And the environment holds no key for any provider
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And oid checks the user's setup before it runs a scripted agent
    When I run "oid run"
    Then the process exits with code 3
    And the project has a worktree outside the project directory, on a branch starting with "oid/run-"
    And nothing the command printed contains "sk-test-anthropic-4711"
