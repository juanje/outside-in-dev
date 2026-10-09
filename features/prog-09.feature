@FR-PROG-09
Feature: Reopen a done feature for review

  Scenario: A done feature reopens at quality_gate and its scenarios keep their status
    Given a completed feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pass"
    And a project file "SPEC.md" containing:
      """
      ### FR-X-01: Alpha
      """
    And a project file "features/x-01.feature" containing:
      """
      @FR-X-01
      Feature: Alpha
      """
    When I run "oid progress reopen FR-X-01"
    Then the command succeeds
    And the feature "FR-X-01" has the status "in_progress"
    And the feature "FR-X-01" has the cycle step "quality_gate"
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pass"
    And the feature "FR-X-01" has the scenario "Beta works" marked "pass"
    And the file "SPEC.md" is unchanged
    And the file "features/x-01.feature" is unchanged

  Scenario Outline: A feature that is not done is refused
    Given a started feature "FR-X-01" at step "<step>" with a scenario "Alpha works" marked "pass"
    When I run "oid progress reopen FR-X-01"
    Then the command fails
    And the error output contains "FR-X-01 is not done"
    And the progress file is unchanged

    Examples:
      | step         |
      | bdd_red      |
      | quality_gate |

  Scenario: Integrity on a focused done feature names reopen and revise
    Given a TypeScript project with unit tests
    And a completed feature "FR-X-01"
    And the focus is on "FR-X-01"
    When I run "oid verify integrity"
    Then the command fails
    And the error output contains "oid progress reopen FR-X-01"
    And the error output contains "oid progress revise FR-X-01"

  Scenario: A checkpoint that later commits left behind does not make the review start with violations
    Given a TypeScript project with unit tests
    And a completed feature "FR-GREETING-01" with a scenario "Greet Ann" marked "pass"
    And the focus is on "FR-GREETING-01"
    And the project is a git repository with its files committed
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
      """
    And the source file "src/greeting.ts" containing:
      """
      export const greeting = "Hello";
      """
    And a verification of "FR-GREETING-01" at step "tdd_green" is recorded
    And the changes are committed
    And the feature file "features/greeting.feature" is changed to:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
          Then nothing is checked
      """
    And the source file "src/greeting.ts" is changed to:
      """
      export const greeting = "Hi";
      """
    And the changes are committed
    When I run "oid progress reopen FR-GREETING-01"
    And I run "oid verify integrity"
    Then the command succeeds
    And the output starts with "integrity: ok"

  Scenario: A change that is not committed when the feature is reopened is still a change
    Given a TypeScript project with unit tests
    And a completed feature "FR-GREETING-01" with a scenario "Greet Ann" marked "pass"
    And the focus is on "FR-GREETING-01"
    And the feature file "features/greeting.feature" containing:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
      """
    And the project is a git repository with its files committed
    And the feature file "features/greeting.feature" is changed to:
      """
      @FR-GREETING-01
      Feature: Greeting

        Scenario: Greet Ann
          Given the greeting for Ann
          Then nothing is checked
      """
    And a verification of "FR-GREETING-01" at step "tdd_green" is recorded
    When I run "oid progress reopen FR-GREETING-01"
    And I run "oid verify integrity"
    Then the command fails
    And the output contains "features/greeting.feature changed an approved feature file"
    And the output contains "Greet Ann"

  Scenario: Reopening a feature is not the green that closing it needs
    Given a TypeScript project with unit tests
    And a completed feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the last green ran the scenario "Alpha works" of "FR-X-01"
    And I run "oid progress reopen FR-X-01"
    And the source file "src/greeting.ts" containing:
      """
      export const greeting = "Hi";
      """
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "no current green ran the scenarios \"Alpha works\""
