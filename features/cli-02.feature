@FR-CLI-02
Feature: Concise status

  Scenario: Status lists the features that are not done and counts the done ones
    Given a completed feature "FR-X-01"
    And a completed feature "FR-X-02"
    And a started feature "FR-X-03" at step "tdd_red"
    And a tracked feature "FR-X-04" titled "Waiting"
    When I run "oid progress status"
    Then the command succeeds
    And the output contains "FR-X-03"
    And the output contains "tdd_red"
    And the output contains "FR-X-04"
    And the output contains "Waiting"
    And the output does not contain "FR-X-01"
    And the output does not contain "FR-X-02"
    And the output contains "2 done"

  Scenario: Status marks the focused feature
    Given a completed feature "FR-X-01"
    And a started feature "FR-X-02" at step "bdd_red"
    And the focus is on "FR-X-02"
    When I run "oid progress status"
    Then the command succeeds
    And the output contains "FR-X-02"
    And the output contains "(focused)"
    And the output does not contain "FR-X-01"

  Scenario: Status still shows the done count when no feature is done
    Given a tracked feature "FR-X-01" titled "Waiting"
    When I run "oid progress status"
    Then the command succeeds
    And the output contains "FR-X-01"
    And the output contains "0 done"

  Scenario: Status shows only the done count when every feature is done
    Given a completed feature "FR-X-01"
    And a completed feature "FR-X-02"
    When I run "oid progress status"
    Then the command succeeds
    And the output contains "2 done"
    And the output does not contain "FR-X-01"
    And the output does not contain "FR-X-02"

  Scenario: Status --all lists every tracked feature including the done ones
    Given a completed feature "FR-X-01"
    And a started feature "FR-X-02" at step "bdd_red"
    And a tracked feature "FR-X-03" titled "Waiting"
    And the focus is on "FR-X-02"
    When I run "oid progress status --all"
    Then the command succeeds
    And the output contains "FR-X-01"
    And the output contains "FR-X-02"
    And the output contains "FR-X-03"
    And the output contains "(focused)"

  Scenario: Status help documents the --all option
    When I run "oid progress status --help"
    Then the command succeeds
    And the output describes the option "--all"
    And the output contains "usage: oid progress status [--all]"
    And the error output is empty
