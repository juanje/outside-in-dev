@FR-CLI-01
Feature: Command help

  Scenario: oid --help says what oid does and describes every command
    When I run "oid --help"
    Then the command succeeds
    And the output contains "Outside-In"
    And the output describes the command "progress"
    And the output describes the command "check"
    And the output describes the command "init"
    And the error output is empty

  Scenario: oid progress --help lists every subcommand with its usage
    When I run "oid progress --help"
    Then the command succeeds
    And the output contains "usage: oid progress <subcommand>"
    And the output describes the command "current"
    And the output describes the command "status"
    And the output describes the command "show"
    And the output describes the command "add"
    And the output describes the command "focus"
    And the output describes the command "step"
    And the output describes the command "scenario"
    And the output describes the command "done"
    And the output contains "oid progress show FR-xxx"
    And the output contains "oid progress add FR-xxx"
    And the output contains "oid progress step FR-xxx <cycle_step>"
    And the output contains "oid progress scenario <pass|fail|pending> FR-xxx"
    And the output contains "oid progress done FR-xxx"
    And the error output is empty

  Scenario: oid check --help shows its usage and its option
    When I run "oid check --help"
    Then the command succeeds
    And the output contains "usage: oid check [--json]"
    And the output describes the option "--json"
    And the error output is empty

  Scenario: oid init --help shows its usage and its option
    When I run "oid init --help"
    Then the command succeeds
    And the output contains "usage: oid init [--import-progress [path]]"
    And the output describes the option "--import-progress"
    And the error output is empty

  Scenario: oid progress step --help names the allowed cycle steps
    When I run "oid progress step --help"
    Then the command succeeds
    And the output contains "usage: oid progress step FR-xxx <cycle_step>"
    And the output contains "select"
    And the output contains "bdd_red"
    And the output contains "tdd_red"
    And the output contains "tdd_green"
    And the output contains "refactor"
    And the output contains "quality_gate"
    And the error output is empty

  Scenario: oid progress scenario --help names the allowed statuses
    When I run "oid progress scenario --help"
    Then the command succeeds
    And the output contains "usage: oid progress scenario <pass|fail|pending> FR-xxx"
    And the output contains "pass"
    And the output contains "fail"
    And the output contains "pending"
    And the error output is empty

  Scenario Outline: Every progress subcommand has its own help
    When I run "oid progress <subcommand> --help"
    Then the command succeeds
    And the output contains "usage: oid progress <subcommand>"
    And the output does not contain "undefined"
    And the error output is empty

    Examples:
      | subcommand |
      | current    |
      | status     |
      | show       |
      | add        |
      | focus      |
      | step       |
      | scenario   |
      | done       |

  Scenario Outline: Help works in an empty directory
    Given an empty project directory
    When I run "<command>"
    Then the command succeeds
    And the output contains "usage:"
    And the error output is empty
    And no project file was changed

    Examples:
      | command                  |
      | oid --help               |
      | oid check --help         |
      | oid init --help          |
      | oid progress --help      |
      | oid progress step --help |

  Scenario Outline: Help works with an invalid project configuration and leaves the project untouched
    Given a tracked feature "FR-X-01" titled "Alpha"
    And an invalid project configuration file
    When I run "<command>"
    Then the command succeeds
    And the output contains "usage:"
    And the error output is empty
    And no project file was changed

    Examples:
      | command                  |
      | oid --help               |
      | oid check --help         |
      | oid init --help          |
      | oid progress --help      |
      | oid progress show --help |

  Scenario: Help is printed instead of the missing-argument error
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step --help"
    Then the command succeeds
    And the output contains "usage: oid progress step"
    And the error output does not contain "usage:"
    And the error output is empty

  Scenario: Help given after the arguments changes nothing
    Given a tracked feature "FR-X-01" titled "Alpha"
    When I run "oid progress step FR-X-01 select --help"
    Then the command succeeds
    And the output contains "usage: oid progress step"
    And the feature "FR-X-01" has the status "pending"
    And no project file was changed

  Scenario: Help for a command that does not exist is an error, not help
    When I run "oid --help"
    Then the command succeeds
    When I run "oid bogus --help"
    Then the command fails
    And the error output contains "unknown command bogus"
    And the error output contains "progress"
    And the error output contains "check"
    And the error output contains "init"
    And the output is empty

  Scenario: Help for a progress subcommand that does not exist is an error, not help
    When I run "oid progress --help"
    Then the command succeeds
    When I run "oid progress bogus --help"
    Then the command fails
    And the error output contains "unknown subcommand bogus"
    And the error output contains "scenario"
    And the output is empty
