@FR-INIT-04
Feature: Set up providers and models

  The user's providers, credentials and models are not part of any project. `oid setup` writes them in the
  user's oid configuration, and a user does not have to edit a file to run oid.

  Background:
    Given a user who has not set up oid

  Scenario: An API key read from standard input is stored for the provider
    Given the standard input holds "sk-test-anthropic-4711"
    When I run "oid setup --provider anthropic --api-key-stdin"
    Then the command succeeds
    And the credentials of oid hold an API key for "anthropic"
    And the credentials file is readable by the user only
    And nothing the command printed contains "sk-test-anthropic-4711"

  Scenario: The models of the roles are assigned with options and checked against the catalogue
    When I run "oid setup --model fast=anthropic/claude-haiku-4-5 --model default=anthropic/claude-sonnet-4-5 --model strong=anthropic/claude-opus-5 --model spec=openrouter/anthropic/claude-opus-5"
    Then the command succeeds
    And the configuration of oid assigns these models:
      | role    | model                              |
      | fast    | anthropic/claude-haiku-4-5         |
      | default | anthropic/claude-sonnet-4-5        |
      | strong  | anthropic/claude-opus-5            |
      | spec    | openrouter/anthropic/claude-opus-5 |

  Scenario: Setting up another provider keeps the credentials of the first
    Given oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    And the standard input holds "sk-test-openai-0815"
    When I run "oid setup --provider openai --api-key-stdin"
    Then the command succeeds
    And the credentials of oid hold an API key for "anthropic"
    And the credentials of oid hold an API key for "openai"
    And nothing the command printed contains "sk-test-openai-0815"

  Scenario: Setting one role keeps the other roles and what else the configuration holds
    Given the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5", "decisions": "openrouter/anthropic/claude-opus-5" } }
      """
    When I run "oid setup --model strong=anthropic/claude-opus-5-5"
    Then the command succeeds
    And the configuration of oid assigns these models:
      | role      | model                              |
      | fast      | anthropic/claude-haiku-4-5         |
      | default   | anthropic/claude-sonnet-4-5        |
      | strong    | anthropic/claude-opus-5-5          |
      | decisions | openrouter/anthropic/claude-opus-5 |

  Scenario: A model that is not in the catalogue is refused and nothing is written
    Given the standard input holds "sk-test-anthropic-4711"
    When I run "oid setup --provider anthropic --api-key-stdin --model fast=anthropic/no-such-model --model default=anthropic/claude-sonnet-4-5 --model strong=anthropic/claude-opus-5"
    Then the command fails
    And the error output contains "anthropic/no-such-model"
    And nothing of oid's configuration was written

  Scenario: A role that does not exist is refused and nothing is written
    When I run "oid setup --model fastest=anthropic/claude-haiku-4-5"
    Then the command fails
    And the error output contains "fastest"
    And the error output contains "fast, default, strong, spec"
    And nothing of oid's configuration was written

  Scenario: A first setup that leaves a required role without a model is refused
    When I run "oid setup --model fast=anthropic/claude-haiku-4-5"
    Then the command fails
    And the error output contains "default, strong"
    And nothing of oid's configuration was written

  Scenario: A provider that Pi does not know is refused and nothing is written
    Given the standard input holds "sk-test-nobody-1"
    When I run "oid setup --provider no-such-provider --api-key-stdin"
    Then the command fails
    And the error output contains "no-such-provider"
    And nothing of oid's configuration was written
    And nothing the command printed contains "sk-test-nobody-1"

  Scenario: An empty key is refused and nothing is written
    Given the standard input holds ""
    When I run "oid setup --provider anthropic --api-key-stdin"
    Then the command fails
    And the error output contains "no API key"
    And nothing of oid's configuration was written

  Scenario: The credentials of an existing Pi installation are imported only when asked
    Given Pi holds the API key "sk-pi-openai-77" for "openai"
    And oid holds the API key "sk-test-anthropic-4711" for "anthropic"
    When I run "oid setup --import-pi"
    Then the command succeeds
    And the credentials of oid hold an API key for "openai"
    And the credentials of oid hold an API key for "anthropic"
    And the credentials file is readable by the user only
    And the output contains "openai"
    And nothing the command printed contains "sk-pi-openai-77"

  Scenario: Without the option, oid does not read the Pi installation
    Given Pi holds the API key "sk-pi-openai-77" for "openai"
    And the standard input holds "sk-test-anthropic-4711"
    When I run "oid setup --provider anthropic --api-key-stdin"
    Then the command succeeds
    And the credentials of oid hold an API key for "anthropic"
    And the credentials of oid hold no credential for "openai"

  Scenario: Importing from a Pi installation that has no credentials is refused
    When I run "oid setup --import-pi"
    Then the command fails
    And the error output contains "no credentials"
    And nothing of oid's configuration was written

  Scenario: Without a terminal and without options, oid setup says what to pass
    When I run "oid setup"
    Then the command fails
    And the error output contains "--api-key-stdin"
    And the error output contains "--model"
    And nothing of oid's configuration was written

  Scenario: A login needs a terminal
    When I run "oid setup --provider openai-codex --login"
    Then the command fails
    And the error output contains "terminal"
    And nothing of oid's configuration was written

  Scenario: oid setup --help shows its usage and its options
    When I run "oid setup --help"
    Then the command succeeds
    And the output contains "usage: oid setup"
    And the output describes the option "--provider"
    And the output describes the option "--login"
    And the output describes the option "--api-key-stdin"
    And the output describes the option "--import-pi"
    And the output describes the option "--model"

  Scenario: At a terminal, the user logs in with the provider's own flow and picks the models
    Given a terminal where the user answers:
      | question                | answer                     |
      | provider                | openai-codex               |
      | code                    | login-code-42              |
      | provider                |                            |
      | fast model              | openai-codex/gpt-5.5       |
      | default model           | openai-codex/gpt-5.5       |
      | strong model            | openai-codex/gpt-6-sol     |
      | spec model              |                            |
    When I run "oid setup"
    Then the command succeeds
    And the output contains "https://login.example.test/openai-codex"
    And the credentials of oid hold a login for "openai-codex"
    And the configuration of oid assigns these models:
      | role    | model                  |
      | fast    | openai-codex/gpt-5.5   |
      | default | openai-codex/gpt-5.5   |
      | strong  | openai-codex/gpt-6-sol |

  Scenario: At a terminal, the user pastes an API key that is not shown
    Given a terminal where the user answers:
      | question                | answer                      |
      | provider                | anthropic                   |
      | login or an API key     | key                         |
      | API key                 | sk-test-anthropic-4711      |
      | provider                |                             |
      | fast model              | anthropic/claude-haiku-4-5  |
      | default model           | anthropic/claude-sonnet-4-5 |
      | strong model            | anthropic/claude-opus-5     |
      | spec model              |                             |
    When I run "oid setup"
    Then the command succeeds
    And the credentials of oid hold an API key for "anthropic"
    And the key "sk-test-anthropic-4711" was asked for at a prompt that does not show it
    And nothing the command printed contains "sk-test-anthropic-4711"

  Scenario: At a terminal, a model that is not in the catalogue is asked again, and an empty answer keeps the current one
    Given the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    And a terminal where the user answers:
      | question                | answer                     |
      | provider                |                            |
      | fast model              |                            |
      | default model           | anthropic/no-such-model    |
      | default model           | anthropic/claude-opus-4-8  |
      | strong model            |                            |
      | spec model              |                            |
    When I run "oid setup"
    Then the command succeeds
    And the output contains "anthropic/no-such-model"
    And the configuration of oid assigns these models:
      | role    | model                       |
      | fast    | anthropic/claude-haiku-4-5  |
      | default | anthropic/claude-opus-4-8   |
      | strong  | anthropic/claude-opus-5     |

  Scenario: oid init offers oid setup to a user who has none, and runs it when the user agrees
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a terminal where the user answers:
      | question                | answer                      |
      | set up                  | yes                         |
      | provider                |                             |
      | fast model              | anthropic/claude-haiku-4-5  |
      | default model           | anthropic/claude-sonnet-4-5 |
      | strong model            | anthropic/claude-opus-5     |
      | spec model              |                             |
    When I run "oid init"
    Then the command succeeds
    And the configuration field "stack" is "typescript"
    And the configuration of oid assigns these models:
      | role    | model                       |
      | fast    | anthropic/claude-haiku-4-5  |
      | default | anthropic/claude-sonnet-4-5 |
      | strong  | anthropic/claude-opus-5     |

  Scenario: oid init without a terminal only says how to set up
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    When I run "oid init"
    Then the command succeeds
    And the output contains "oid setup"
    And nothing of oid's configuration was written

  Scenario: oid init does not offer oid setup to a user who has set it up
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And the configuration of oid contains:
      """
      { "models": { "fast": "anthropic/claude-haiku-4-5", "default": "anthropic/claude-sonnet-4-5", "strong": "anthropic/claude-opus-5" } }
      """
    When I run "oid init"
    Then the command succeeds
    And the output does not contain "oid setup"
