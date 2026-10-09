@FR-PROG-06
Feature: Mark a feature done

  Scenario: A feature whose scenarios all pass is marked done
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pass"
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command succeeds
    And the feature "FR-X-01" has the status "done"
    And the feature "FR-X-01" has no cycle step
    And the feature "FR-X-01" has 2 scenarios

  Scenario: Marking the focused feature done clears the focus
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the focus is on "FR-X-01"
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command succeeds
    And no feature is focused in the progress file

  Scenario: Marking another feature done keeps the focus
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And a tracked feature "FR-X-02" titled "Beta"
    And the focus is on "FR-X-02"
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command succeeds
    And the feature "FR-X-01" has the status "done"
    And the current focus is "FR-X-02"

  Scenario: A feature without scenarios is refused
    Given a started feature "FR-X-01" at step "select"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "FR-X-01"
    And the progress file is unchanged

  Scenario: A feature with a scenario that does not pass is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "fail"
    And the started feature "FR-X-01" also has a scenario "Gamma works" marked "pending"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "Beta works"
    And the error output contains "Gamma works"
    And the progress file is unchanged

  Scenario: A feature file scenario tagged with the feature but not recorded is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And a feature file "features/x.feature" containing:
      """
      @FR-X-01
      Feature: X

        Scenario: Alpha works

        Scenario: Beta works
      """
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "Beta works"
    And the error output does not contain "Alpha works"
    And the feature "FR-X-01" has the status "in_progress"
    And the progress file is unchanged

  Scenario: A scenario that carries the tag itself in a file of another feature is also refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And a feature file "features/y.feature" containing:
      """
      @FR-X-02
      Feature: Y

        Scenario: Alpha works

        @FR-X-01
        Scenario: Gamma works
      """
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "Gamma works"
    And the progress file is unchanged

  Scenario: A scenario outline recorded under its name is not reported with the one that is missing
    Given a tracked feature "FR-X-01" with a scenario "Alpha works for <word>" marked "pass"
    And a feature file "features/x.feature" containing:
      """
      @FR-X-01
      Feature: X

        Scenario Outline: Alpha works for <word>
          When I say "<word>"

          Examples:
            | word |
            | one  |
            | two  |

        Scenario: Beta works
      """
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "Beta works"
    And the error output does not contain "Alpha works"
    And the progress file is unchanged

  Scenario: A scenario tagged with another feature is not named as missing
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And a feature file "features/x.feature" containing:
      """
      Feature: X

        @FR-X-01
        Scenario: Alpha works

        @FR-X-01
        Scenario: Beta works

        @FR-X-02
        Scenario: Delta works
      """
    And the last green ran every scenario of "FR-X-01" that is marked "pass"
    When I run "oid progress done FR-X-01"
    Then the command fails
    And the error output contains "Beta works"
    And the error output does not contain "Delta works"
    And the progress file is unchanged

  Scenario: A feature that is not tracked is refused
    Given a tracked feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    When I run "oid progress done FR-X-99"
    Then the command fails
    And the error output contains "FR-X-99"
    And the progress file is unchanged
