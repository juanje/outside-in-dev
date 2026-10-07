@FR-AGENT-02
Feature: The shell's arguments cannot name orchestrator state

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"

  Scenario Outline: A command the profile allows cannot name orchestrator state or the outside in its arguments
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: <command>
    Then the call is blocked
    And the reason names "<named>"

    Examples:
      | command                                                | named                 |
      | npx vitest run --outputFile=progress.json              | progress.json         |
      | npx vitest run --outputFile progress.json              | progress.json         |
      | npx vitest run -o=.outside-in/result.json              | .outside-in/result.json |
      | npx vitest run --outputFile=features/../.git/result    | .git/result           |
      | npx tsc --noEmit --project ../elsewhere/tsconfig.json  | ../elsewhere          |
      | cat progress.json                                      | progress.json         |

  Scenario: A command the profile allows still runs with ordinary arguments
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: npx vitest run --reporter=verbose --config vitest.config.ts tests/unit/cart.test.ts
    Then the call is allowed
