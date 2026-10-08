@FR-PROG-08
Feature: Revise a tracked requirement

  Scenario: A done feature with passing scenarios is reset to bdd_red with every scenario pending
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
    When I run "oid progress revise FR-X-01"
    Then the command succeeds
    And the feature "FR-X-01" has the status "in_progress"
    And the feature "FR-X-01" has the cycle step "bdd_red"
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pending"
    And the feature "FR-X-01" has the scenario "Beta works" marked "pending"
    And the file "SPEC.md" is unchanged
    And the file "features/x-01.feature" is unchanged

  Scenario Outline: A feature at a later cycle step is reset the same way
    Given a started feature "FR-X-01" at step "<step>" with a scenario "Alpha works" marked "pass"
    When I run "oid progress revise FR-X-01"
    Then the command succeeds
    And the feature "FR-X-01" has the cycle step "bdd_red"
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pending"

    Examples:
      | step         |
      | tdd_green    |
      | quality_gate |

  Scenario: A feature already at bdd_red is left as it is
    Given a started feature "FR-X-01" at step "bdd_red" with a scenario "Alpha works" marked "fail"
    When I run "oid progress revise FR-X-01"
    Then the command succeeds
    And the progress file is unchanged

  Scenario: A feature that is not tracked is refused
    Given a progress file with no tracked features
    When I run "oid progress revise FR-MISSING-01"
    Then the command fails
    And the error output contains "FR-MISSING-01"
    And the progress file is unchanged
