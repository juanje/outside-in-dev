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
