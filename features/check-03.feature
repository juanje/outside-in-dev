@FR-CHECK-03
Feature: Check progress consistency

  Scenario: A focus on a feature that is not in progress is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.

      ### FR-X-02: Logout

      The user can log out.
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-01",
        "features": [
          { "id": "FR-X-01", "title": "Login", "status": "pending" },
          { "id": "FR-X-02", "title": "Logout", "status": "in_progress", "cycle_step": "select", "scenarios": [] }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output does not contain "FR-X-02"
    And the output does not contain "no violations"

  Scenario: A focus on a feature that is not tracked is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-01",
        "features": []
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output does not contain "no violations"

  Scenario: A done feature with a scenario that does not pass is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.

      ### FR-X-02: Logout

      The user can log out.
      """
    And a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        Scenario: Working login

        Scenario: Broken login
      """
    And a feature file "features/logout.feature" containing:
      """
      @FR-X-02
      Feature: Logout

        Scenario: Working logout
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "done",
            "scenarios": [
              { "name": "Working login", "bdd": "pass" },
              { "name": "Broken login", "bdd": "fail" }
            ]
          },
          {
            "id": "FR-X-02",
            "title": "Logout",
            "status": "done",
            "scenarios": [{ "name": "Working logout", "bdd": "pass" }]
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "Broken login"
    And the output does not contain "Working login"
    And the output does not contain "FR-X-02"
    And the output does not contain "no violations"

  Scenario: A done feature with an unrecorded scenario is reported, a feature in progress is not
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.

      ### FR-X-02: Logout

      The user can log out.
      """
    And a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        Scenario: Working login

        Scenario: Forgotten login
      """
    And a feature file "features/logout.feature" containing:
      """
      @FR-X-02
      Feature: Logout

        Scenario: Working logout

        Scenario: Planned logout
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-02",
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "done",
            "scenarios": [{ "name": "Working login", "bdd": "pass" }]
          },
          {
            "id": "FR-X-02",
            "title": "Logout",
            "status": "in_progress",
            "cycle_step": "bdd_red",
            "scenarios": [{ "name": "Working logout", "bdd": "fail" }]
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "Forgotten login"
    And the output does not contain "Working login"
    And the output does not contain "FR-X-02"
    And the output does not contain "Planned logout"
    And the output does not contain "no violations"

  Scenario: A done feature with a scenario outline recorded under its name is reported only for the scenario it lacks
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        Scenario Outline: Login for <role>
          When I log in as "<role>"

          Examples:
            | role  |
            | admin |
            | guest |

        Scenario: Forgotten login
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "done",
            "scenarios": [{ "name": "Login for <role>", "bdd": "pass" }]
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "Forgotten login"
    And the output does not contain "Login for"
    And the output does not contain "no violations"

  Scenario: A started feature that no feature file tags is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.

      ### FR-X-02: Logout

      The user can log out.

      ### FR-X-03: Signup

      The user can sign up.

      ### FR-X-04: Reset

      The user can reset a password.
      """
    And a feature file "features/logout.feature" containing:
      """
      Feature: Logout

        @FR-X-02
        Scenario: Tagged logout
      """
    And a feature file "features/signup.feature" containing:
      """
      @FR-X-03
      Feature: Signup

        Scenario: Inherited signup
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "done",
            "scenarios": [{ "name": "Lost login", "bdd": "pass" }]
          },
          {
            "id": "FR-X-02",
            "title": "Logout",
            "status": "in_progress",
            "cycle_step": "bdd_red",
            "scenarios": []
          },
          {
            "id": "FR-X-03",
            "title": "Signup",
            "status": "in_progress",
            "cycle_step": "tdd_red",
            "scenarios": []
          },
          {
            "id": "FR-X-04",
            "title": "Reset",
            "status": "in_progress",
            "cycle_step": "bdd_red",
            "scenarios": []
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "FR-X-04"
    And the output does not contain "FR-X-02"
    And the output does not contain "FR-X-03"
    And the output does not contain "no violations"

  Scenario: A feature that is only selected needs no feature file yet
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          { "id": "FR-X-01", "title": "Login", "status": "in_progress", "cycle_step": "bdd_red", "scenarios": [] }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    Given a progress file containing:
      """
      {
        "current_focus": "FR-X-01",
        "features": [
          { "id": "FR-X-01", "title": "Login", "status": "in_progress", "cycle_step": "select", "scenarios": [] }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "no violations"

  Scenario: A recorded scenario that no feature file contains is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        Scenario: Existing login
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-01",
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "in_progress",
            "cycle_step": "tdd_red",
            "scenarios": [
              { "name": "Existing login", "bdd": "pass" },
              { "name": "Renamed login", "bdd": "fail" }
            ]
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "Renamed login"
    And the output does not contain "Existing login"
    And the output does not contain "no violations"

  Scenario: A recorded scenario that belongs to another requirement is reported
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.

      ### FR-X-02: Logout

      The user can log out.
      """
    And a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        Scenario: Own login
      """
    And a feature file "features/logout.feature" containing:
      """
      Feature: Logout

        @FR-X-02
        Scenario: Borrowed login
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-01",
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "in_progress",
            "cycle_step": "tdd_red",
            "scenarios": [
              { "name": "Own login", "bdd": "pass" },
              { "name": "Borrowed login", "bdd": "pass" }
            ]
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "FR-X-01"
    And the output contains "Borrowed login"
    And the output does not contain "Own login"

  Scenario: An invalid progress file is reported instead of crashing
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.
      """
    And a progress file containing:
      """
      {
        "current_focus": null,
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "in_progress",
            "cycle_step": "select",
            "scenarios": [],
            "notes": "remember this"
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "progress.json"
    And the output contains "features[0].notes"
    And the output does not contain "no violations"

  Scenario: A project fixed to be consistent reports no violations
    Given a SPEC.md containing:
      """
      ### FR-X-01: Login

      The user can log in.

      ### FR-X-02: Logout

      The user can log out.
      """
    And a feature file "features/login.feature" containing:
      """
      @FR-X-01
      Feature: Login

        Scenario: Working login
      """
    And a feature file "features/logout.feature" containing:
      """
      @FR-X-02
      Feature: Logout

        Scenario: Working logout
      """
    And a progress file containing:
      """
      {
        "current_focus": "FR-X-01",
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "done",
            "scenarios": [{ "name": "Working login", "bdd": "fail" }]
          },
          {
            "id": "FR-X-02",
            "title": "Logout",
            "status": "in_progress",
            "cycle_step": "tdd_red",
            "scenarios": [{ "name": "Working logout", "bdd": "fail" }]
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "Working login"
    Given a progress file containing:
      """
      {
        "current_focus": "FR-X-02",
        "features": [
          {
            "id": "FR-X-01",
            "title": "Login",
            "status": "done",
            "scenarios": [{ "name": "Working login", "bdd": "pass" }]
          },
          {
            "id": "FR-X-02",
            "title": "Logout",
            "status": "in_progress",
            "cycle_step": "tdd_red",
            "scenarios": [{ "name": "Working logout", "bdd": "fail" }]
          }
        ]
      }
      """
    When I run "oid check"
    Then the output contains "no violations"
