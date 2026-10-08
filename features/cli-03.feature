@FR-CLI-03
Feature: Show the version

  Scenario Outline: oid prints the version of the installed package
    When I run "<command>"
    Then the command succeeds
    And the output is "oid" followed by the version in oid's package.json
    And the error output is empty

    Examples:
      | command       |
      | oid --version |
      | oid -v        |

  Scenario: The version does not depend on the project it runs in
    Given an empty project directory
    When I run "oid --version"
    Then the command succeeds
    And the output is "oid" followed by the version in oid's package.json
    And the error output is empty
    And no project file was changed

  Scenario: oid --help lists the version option
    When I run "oid --help"
    Then the command succeeds
    And the output describes the option "-v, --version"
    And the error output is empty
