@FR-RUN-01
Feature: Start a run

  Background:
    Given a git project with a green suite
    And SPEC.md has the requirements "FR-CART-01", "FR-CART-02", "FR-CART-03", "FR-CART-04" and "FR-CART-05"
    And progress.json tracks "FR-CART-01" as done, "FR-CART-02" and "FR-CART-03" as pending and "FR-CART-05" as in progress

  Scenario: A run goes through the start states and selects the pending features
    When I run "oid run"
    Then the process exits with code 3
    And the event log of the run starts with the transitions to "PREFLIGHT", "BASELINE", "SPEC_CHECK", "SELECT_FR" and "FEATURE_WRITE", in that order
    And the transition to "FEATURE_WRITE" says it selected "FR-CART-02" and "FR-CART-03", in that order
    And a line printed says the start finished and the selected features wait for feature writing

  Scenario: Every event is printed as one line
    When I run "oid run"
    Then the output has as many lines as the event log of the run has events
    And no line of the output mentions "undefined"

  Scenario: The events of a run carry the time each one happened
    When I run "oid run"
    Then the events of the run were stamped with the times they happened, not all the same

  Scenario: A run works in its own worktree on a branch named after the date
    When I run "oid run"
    Then the project has a worktree outside the project directory, on a branch starting with "oid/run-"
    And the worktree holds the committed files

  Scenario: A run uses the branch it is given
    When I run "oid run --branch login"
    Then the project has a worktree outside the project directory, on the branch "oid/login"

  Scenario: The user's copy is left as it was
    Given the user's copy has an uncommitted change to "README.md"
    When I run "oid run"
    Then the process exits with code 3
    And the user's copy is on its own branch, at its own commit, with only that uncommitted change

  Scenario: The existing suite runs in the worktree and its result is recorded
    When I run "oid run"
    Then both suite commands ran in the worktree and not in the user's copy
    And the baseline of the run records the commit the run started from
    And the baseline of the run records no failing unit test and no failing scenario
    And the reports of the suite run are kept in the run directory

  @process
  Scenario: A red unit test at the start stops the run and asks
    Given a unit test "totals > adds a line" fails in the suite
    When I run "oid run"
    Then the process exits with code 3
    And the output asks about the red suite, with the actions "view", "continue" and "abort"
    And the baseline of the run lists the failing unit test "totals > adds a line"
    And no feature is selected

  Scenario: A red scenario at the start stops the run and asks
    Given a scenario "Pay with a card" fails in the suite
    When I run "oid run"
    Then the process exits with code 3
    And the output asks about the red suite, with the actions "view", "continue" and "abort"
    And the baseline of the run lists the failing scenario "Pay with a card"
    And no feature is selected

  Scenario: A red suite saves the session so the run can be resumed
    Given a unit test "totals > adds a line" fails in the suite
    When I run "oid run"
    Then the saved session names the run, its worktree and branch, the commit it started from and the state "BASELINE"
    And the saved session holds the pending question about the red suite

  Scenario: What the runners print is never read
    Given the unit runner prints "1 failed" and writes a report where every test passed
    When I run "oid run"
    Then the process exits with code 3

  Scenario: A unit runner that fails with a green report stops the run and asks
    Given the unit runner writes a report where every test passed and exits with code 1
    When I run "oid run"
    Then the process exits with code 3
    And the output asks about the red suite, with the actions "view", "continue" and "abort"
    And the question about the red suite says "unit: the runner exited 1 but its report names no failing test"
    And the baseline of the run lists the problem "unit: the runner exited 1 but its report names no failing test"
    And no feature is selected

  Scenario: A BDD runner that fails with a green report stops the run and asks
    Given the BDD runner writes a report where every scenario passed and exits with code 1
    When I run "oid run"
    Then the process exits with code 3
    And the output asks about the red suite, with the actions "view", "continue" and "abort"
    And the question about the red suite says "bdd: the runner exited 1 but its report names no failing scenario"
    And the baseline of the run lists the problem "bdd: the runner exited 1 but its report names no failing scenario"
    And no feature is selected

  Scenario: A unit runner that writes no report is an error
    Given the unit runner writes no report and exits with code 4
    When I run "oid run"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "unit: the runner wrote no report (exit 4)"
    And no feature is selected

  Scenario: The saved session of a started run holds what the next state needs
    When I run "oid run"
    Then the saved session names the run, its worktree and branch, the commit it started from and the state "FEATURE_REVIEW"
    And the saved session lists the target features "FR-CART-02" and "FR-CART-03"

  Scenario: A run can be limited to a number of features
    When I run "oid run --max-frs 1"
    Then the transition to "FEATURE_WRITE" says it selected "FR-CART-02"
    And the saved session lists the target features "FR-CART-02"

  Scenario: A run can be given the features to work on
    When I run "oid run --fr FR-CART-03"
    Then the transition to "FEATURE_WRITE" says it selected "FR-CART-03"
    And the saved session lists the target features "FR-CART-03"

  Scenario: A feature that SPEC.md does not define is refused
    When I run "oid run --fr FR-CART-09"
    Then the process exits with code 1
    And the output says "FR-CART-09" is not in SPEC.md
    And the event log of the run records an error mentioning "FR-CART-09"
    And no feature is selected

  Scenario: A feature that progress.json does not track is refused
    When I run "oid run --fr FR-CART-04"
    Then the process exits with code 1
    And the output says "FR-CART-04" is not tracked in progress.json
    And the event log of the run records an error mentioning "FR-CART-04"
    And no feature is selected

  Scenario: A feature that is done is refused
    When I run "oid run --fr FR-CART-01"
    Then the process exits with code 1
    And the output says "FR-CART-01" is not pending
    And the event log of the run records an error mentioning "FR-CART-01"
    And no feature is selected

  Scenario: A feature that is in progress is refused
    When I run "oid run --fr FR-CART-05"
    Then the process exits with code 1
    And the output says "FR-CART-05" is not pending
    And the event log of the run records an error mentioning "FR-CART-05"
    And no feature is selected

  Scenario: A run with no pending feature has nothing to do
    Given progress.json tracks no pending feature
    When I run "oid run"
    Then the process exits with code 0
    And the output says there are no pending features
    And no feature is selected

  Scenario: A new run starts a session of its own
    Given a saved session of an earlier run with a pending question
    When I run "oid run"
    Then the saved session names the new run and not the earlier one
    And the saved session holds no pending question of the earlier run

  Scenario: A run refuses to start while another one holds the lock
    Given the lock of the project is held by a process that is running
    When I run "oid run"
    Then the process exits with code 1
    And the error mentions the lock and the process that holds it
    And no worktree or branch was created
    And the lock is still held by that process

  Scenario: A run refuses to start over the lock of a process that is gone
    Given the lock of the project is held by a process that is no longer running
    When I run "oid run"
    Then the process exits with code 1
    And the error mentions the lock, the process that is gone and that the lock file can be removed
    And no worktree or branch was created
    And the lock file is as it was

  Scenario: A run holds the lock with its own process while it works
    Given the unit runner reports the content of the lock
    When I run "oid run"
    Then the lock held while the suite ran named the process of the run

  Scenario: The lock is released when a run ends
    When I run "oid run"
    Then the project has no lock

  Scenario: The lock is released when a run stops to ask
    Given a unit test "totals > adds a line" fails in the suite
    When I run "oid run"
    Then the process exits with code 3
    And the project has no lock

  Scenario: A project without a configuration file is refused
    Given the project has no ".outside-in.json"
    When I run "oid run"
    Then the process exits with code 1
    And the error mentions ".outside-in.json"
    And no worktree or branch was created
