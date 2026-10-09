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

  Scenario: Revise prints the step and how many scenarios are pending
    Given a completed feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pass"
    When I run "oid progress revise FR-X-01"
    Then the command succeeds
    And the output contains "FR-X-01: bdd_red, 2 scenarios pending"

  Scenario: Revise on a feature already at bdd_red says nothing changes
    Given a started feature "FR-X-01" at step "bdd_red" with a scenario "Alpha works" marked "fail"
    When I run "oid progress revise FR-X-01"
    Then the command succeeds
    And the output contains "FR-X-01: already at bdd_red"

  Scenario: A revised feature whose scenarios were only removed leaves bdd_red for quality_gate
    Given a completed feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pass"
    And a project file "features/x-01.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given a thing

        Scenario: Beta works
          Given a thing
      """
    And a project file "src/code.ts" containing:
      """
      export const code = 1;
      """
    And the project is a git repository with its files committed
    When I run "oid progress revise FR-X-01"
    And the feature file "features/x-01.feature" is changed to:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given a thing
      """
    And I run "oid progress scenario drop FR-X-01 \"Beta works\""
    And a later green ran the scenario "Alpha works" of "FR-X-01"
    And I run "oid progress step FR-X-01 quality_gate"
    Then the command succeeds
    And the feature "FR-X-01" has the cycle step "quality_gate"
    And the feature "FR-X-01" has the scenario "Alpha works" marked "pending"

  Scenario: A revised feature whose scenario text changed does not leave bdd_red
    Given a completed feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pass"
    And a project file "features/x-01.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given a thing

        Scenario: Beta works
          Given a thing
      """
    And the project is a git repository with its files committed
    When I run "oid progress revise FR-X-01"
    And the feature file "features/x-01.feature" is changed to:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given another thing
      """
    And I run "oid progress scenario drop FR-X-01 \"Beta works\""
    And a later green ran the scenario "Alpha works" of "FR-X-01"
    And I run "oid progress step FR-X-01 quality_gate"
    Then the command fails
    And the error output contains "Alpha works"
    And the error output contains "changed"
    And the feature "FR-X-01" has the cycle step "bdd_red"

  Scenario Outline: A revised feature whose code or steps changed does not leave bdd_red
    Given a completed feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And a project file "features/x-01.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given a thing
      """
    And a project file "src/code.ts" containing:
      """
      export const code = 1;
      """
    And a project file "features/steps/x.steps.ts" containing:
      """
      export const steps = 1;
      """
    And the project is a git repository with its files committed
    When I run "oid progress revise FR-X-01"
    And a project file "<file>" containing:
      """
      export const changed = 2;
      """
    And a later green ran the scenario "Alpha works" of "FR-X-01"
    And I run "oid progress step FR-X-01 quality_gate"
    Then the command fails
    And the error output contains "<file>"
    And the feature "FR-X-01" has the cycle step "bdd_red"

    Examples:
      | file                      |
      | src/code.ts               |
      | features/steps/x.steps.ts |

  Scenario: A revised feature without a green that ran every scenario does not leave bdd_red and names the green needed
    Given a completed feature "FR-X-01" with a scenario "Alpha works" marked "pass"
    And the started feature "FR-X-01" also has a scenario "Beta works" marked "pass"
    And a project file "features/x-01.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given a thing

        Scenario: Beta works
          Given a thing
      """
    And the project is a git repository with its files committed
    When I run "oid progress revise FR-X-01"
    And a later green ran the scenario "Alpha works" of "FR-X-01"
    And I run "oid progress step FR-X-01 quality_gate"
    Then the command fails
    And the error output contains "Beta works"
    And the error output contains "oid verify green features/x-01.feature:4 features/x-01.feature:7"
    And the feature "FR-X-01" has the cycle step "bdd_red"

  Scenario: A feature at bdd_red that was not revised does not leave it for quality_gate
    Given a started feature "FR-X-01" at step "bdd_red" with a scenario "Alpha works" marked "pending"
    And a project file "features/x-01.feature" containing:
      """
      @FR-X-01
      Feature: Alpha

        Scenario: Alpha works
          Given a thing
      """
    And the project is a git repository with its files committed
    And a later green ran the scenario "Alpha works" of "FR-X-01"
    When I run "oid progress step FR-X-01 quality_gate"
    Then the command fails
    And the error output contains "revise"
    And the feature "FR-X-01" has the cycle step "bdd_red"
    And the progress file is unchanged
