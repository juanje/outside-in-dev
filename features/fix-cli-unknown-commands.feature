Feature: Reject unknown commands and missing arguments

  @FR-PROG-01
  Scenario: An unknown command is named and the valid commands are listed
    When I run "oid bogus"
    Then the command fails
    And the error output contains "bogus"
    And the error output contains "progress"
    And the error output contains "check"
    And the output does not contain "undefined"
    And the error output does not contain "undefined"

  @FR-PROG-01
  Scenario: Running oid progress without a subcommand lists the valid subcommands
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress"
    Then the command fails
    And the error output contains "current"
    And the error output contains "status"
    And the error output contains "show"
    And the error output contains "add"
    And the error output contains "focus"
    And the error output contains "step"
    And the error output contains "scenario"
    And the error output contains "done"
    And the output does not contain "Alpha"

  @FR-PROG-01
  Scenario: An unknown progress subcommand is named and the valid ones are listed
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress bogus"
    Then the command fails
    And the error output contains "bogus"
    And the error output contains "scenario"
    And the error output contains "done"
    And the output does not contain "Alpha"
    And the progress file is unchanged

  @FR-PROG-01
  Scenario: Show without a feature ID prints its usage
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress show"
    Then the command fails
    And the error output contains "usage: oid progress show FR-xxx"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-02
  Scenario: Add without a feature ID prints its usage
    Given a SPEC.md defining the requirements "FR-X-01"
    And a tracked feature "FR-X-02" titled "Beta"
    When I run "oid progress add"
    Then the command fails
    And the error output contains "usage: oid progress add FR-xxx"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-02
  Scenario: Add without a title prints its usage and tracks nothing
    Given a SPEC.md defining the requirements "FR-X-01"
    And a tracked feature "FR-X-02" titled "Beta"
    When I run "oid progress add FR-X-01"
    Then the command fails
    And the error output contains "usage: oid progress add FR-xxx"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-03
  Scenario: Focus without a feature ID prints its usage
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress focus"
    Then the command fails
    And the error output contains "usage: oid progress focus FR-xxx"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-04
  Scenario: Step without a feature ID prints its usage
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step"
    Then the command fails
    And the error output contains "usage: oid progress step FR-xxx <cycle_step>"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-04
  Scenario: Step without a cycle step prints its usage
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-01"
    Then the command fails
    And the error output contains "usage: oid progress step FR-xxx <cycle_step>"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-05
  Scenario: Scenario without arguments prints its usage
    Given a tracked feature "FR-X-01" with a scenario "It works" marked "pending"
    When I run "oid progress scenario"
    Then the command fails
    And the error output contains "usage: oid progress scenario"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-05
  Scenario: Scenario without a name prints its usage
    Given a tracked feature "FR-X-01" with a scenario "It works" marked "pending"
    When I run "oid progress scenario pass FR-X-01"
    Then the command fails
    And the error output contains "usage: oid progress scenario"
    And the error output does not contain "undefined"
    And the progress file is unchanged

  @FR-PROG-06
  Scenario: Done without a feature ID prints its usage
    Given a tracked feature "FR-X-01" with a scenario "It works" marked "pass"
    When I run "oid progress done"
    Then the command fails
    And the error output contains "usage: oid progress done FR-xxx"
    And the error output does not contain "undefined"
    And the progress file is unchanged
