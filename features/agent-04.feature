@FR-AGENT-04
Feature: Completion report

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"

  Scenario: An agent that reports done with exactly the files it changed succeeds
    Given the agent changes "src/cart.ts"
    And the agent adds "src/discount.ts"
    And the agent deletes "tests/unit/cart.test.ts"
    And the agent ends by reporting done with the files "src/cart.ts", "src/discount.ts" and "tests/unit/cart.test.ts"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt succeeds

  Scenario: An agent that never calls the report tool fails the attempt
    Given the agent changes "src/cart.ts"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt fails
    And the failure says the agent made no report

  Scenario: A report that leaves out a file the agent changed fails the attempt
    Given the agent changes "src/cart.ts"
    And the agent adds "src/discount.ts"
    And the agent ends by reporting done with the files "src/cart.ts"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt fails
    And the failure names the missing file "src/discount.ts"

  Scenario: A report that names a file the agent did not change fails the attempt
    Given the agent changes "src/cart.ts"
    And the agent ends by reporting done with the files "src/cart.ts" and "src/invented.ts"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt fails
    And the failure names the extra file "src/invented.ts"

  Scenario: A blocked report is returned as blocked, with its reason and detail
    Given the agent ends by reporting it is blocked by a "spec_conflict" with the detail "FR-CART-01 and FR-CART-04 disagree on the rounding"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt is blocked with the reason "spec_conflict" and the detail "FR-CART-01 and FR-CART-04 disagree on the rounding"

  Scenario Outline: Every step is offered the report tool
    Given oid opened an agent session for the step <step>
    Then the session offers the tool "report"

    Examples:
      | step          |
      | FEATURE_WRITE |
      | BDD_RED       |
      | TDD_RED       |
      | CODE_GREEN    |
      | REFACTOR      |
      | FR_REFACTOR   |
      | QUALITY_FIX   |
