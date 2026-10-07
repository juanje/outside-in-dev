@FR-PROG-04
Feature: A gap seen at the quality gate is a new Red

  Scenario Outline: From the quality gate the cycle goes back to a Red
    Given a started feature "FR-X-01" at step "quality_gate"
    When I run "oid progress step FR-X-01 <to>"
    Then the command succeeds
    And the feature "FR-X-01" has the cycle step "<to>"

    Examples:
      | to      |
      | bdd_red |
      | tdd_red |
