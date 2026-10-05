@FR-PROG-04
Feature: Advance the cycle step

  Scenario: A pending feature is started with select
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-01 select"
    Then the command succeeds
    And the feature "FR-X-01" has the status "in_progress"
    And the feature "FR-X-01" has the cycle step "select"

  Scenario Outline: The cycle moves forward through its steps
    Given a started feature "FR-X-01" at step "<from>"
    When I run "oid progress step FR-X-01 <to>"
    Then the command succeeds
    And the feature "FR-X-01" has the cycle step "<to>"

    Examples:
      | from      | to            |
      | select    | bdd_red       |
      | bdd_red   | tdd_red       |
      | tdd_red   | tdd_green     |
      | tdd_green | refactor      |
      | tdd_green | tdd_red       |
      | tdd_green | bdd_red       |
      | tdd_green | quality_gate  |
      | refactor  | tdd_red       |
      | refactor  | bdd_red       |
      | refactor  | quality_gate  |

  Scenario Outline: A step that the cycle does not allow is rejected
    Given a started feature "FR-X-01" at step "<from>"
    When I run "oid progress step FR-X-01 <to>"
    Then the command fails
    And the error output contains "<from>"
    And the error output contains "<to>"
    And the progress file is unchanged

    Examples:
      | from         | to           |
      | select       | tdd_green    |
      | select       | quality_gate |
      | bdd_red      | refactor     |
      | tdd_red      | bdd_red      |
      | refactor     | tdd_green    |
      | quality_gate | select       |
      | tdd_red      | tdd_red      |

  Scenario: An unknown step name is rejected
    Given a started feature "FR-X-01" at step "select"
    When I run "oid progress step FR-X-01 sleeping"
    Then the command fails
    And the error output contains "sleeping"
    And the progress file is unchanged

  Scenario: A pending feature can only start with select
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-01 bdd_red"
    Then the command fails
    And the error output contains "bdd_red"
    And the progress file is unchanged

  Scenario: A feature that is done cannot change step
    Given a completed feature "FR-X-01"
    When I run "oid progress step FR-X-01 select"
    Then the command fails
    And the error output contains "FR-X-01"
    And the progress file is unchanged

  Scenario: A feature that is not tracked is rejected
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-99 select"
    Then the command fails
    And the error output contains "FR-X-99"
    And the progress file is unchanged
