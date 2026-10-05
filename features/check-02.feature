@FR-CHECK-02
Feature: Check scenario traceability

  Scenario: A scenario without a requirement tag is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a feature file "features/login.feature" containing:
      """
      Feature: Login

        @FR-X-01
        Scenario: Traced login

        Scenario: Orphan login
      """
    When I run "oid check"
    Then the output contains "features/login.feature"
    And the output contains "Orphan login"
    And the output does not contain "Traced login"
    And the output does not contain "no violations"

  Scenario: An NFR tag alone does not trace a scenario
    Given a SPEC.md containing:
      """
      ### NFR-01: Speed

      It is fast.
      """
    And a feature file "features/speed.feature" containing:
      """
      Feature: Speed

        @NFR-01
        Scenario: Fast start
      """
    When I run "oid check"
    Then the output contains "features/speed.feature"
    And the output contains "Fast start"
    And the output does not contain "no violations"

  Scenario: A requirement tag inherited from the Feature counts
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        Scenario: Inherited login
      """
    And a feature file "features/orphan.feature" containing:
      """
      Feature: Orphan

        Scenario: Lonely scenario
      """
    When I run "oid check"
    Then the output contains "Lonely scenario"
    And the output does not contain "Inherited login"

  Scenario: A tag naming a requirement missing from SPEC.md is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a feature file "features/login.feature" containing:
      """
      Feature: Login

        @FR-X-01 @FR-X-99
        Scenario: Ghost login
      """
    When I run "oid check"
    Then the output contains "@FR-X-99"
    And the output contains "Ghost login"
    And the output does not contain "@FR-X-01"

  Scenario: An NFR tag missing from SPEC.md is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a feature file "features/login.feature" containing:
      """
      Feature: Login

        @FR-X-01 @NFR-42
        Scenario: Slow login
      """
    When I run "oid check"
    Then the output contains "@NFR-42"
    And the output contains "Slow login"

  Scenario: Tags that are not requirement tags are ignored
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a feature file "features/login.feature" containing:
      """
      Feature: Login

        @wip @smoke
        Scenario: Tagged login

        @FR-X-01 @wip
        Scenario: Traced login
      """
    When I run "oid check"
    Then the output contains "Tagged login"
    And the output does not contain "@wip"
    And the output does not contain "@smoke"
    And the output does not contain "Traced login"

  Scenario: A project fixed to trace every scenario reports no violations
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.

      ### NFR-01: Speed

      It is fast.
      """
    And a feature file "features/login.feature" containing:
      """
      Feature: Login

        Scenario: Untraced login
      """
    When I run "oid check"
    Then the output contains "Untraced login"
    Given a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        @NFR-01
        Scenario: Traced login
      """
    When I run "oid check"
    Then the output contains "no violations"
