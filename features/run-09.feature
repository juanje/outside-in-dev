@FR-RUN-09
Feature: Resume, abort and concurrency

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

  Scenario: Resume is refused while the process of the run is alive, and nothing is touched
    Given "oid run --fr FR-CART-02" was run without a terminal and saved its question about the feature files
    And the lock of the project is held by a process that is running
    When I run "oid resume" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the error mentions the lock and the process that holds it
    And the lock is still held by that process
    And the human was not asked
    And the saved session holds the pending question about the feature files

  Scenario: Resume presents the pending review of the feature files again, and the run goes on once the human approves
    Given "oid run --fr FR-CART-02" was run without a terminal and saved its question about the feature files
    When I run "oid resume" with a terminal where the human answers "approve"
    Then the human was asked exactly once
    And the question showed the text of the feature file of "FR-CART-02"
    And the event log of the run records that the run was resumed at "FEATURE_REVIEW"
    And that event lists no discarded file
    And the feature-writing agent was asked once in all
    And the event log of the run records a transition from "FEATURE_REVIEW" to "BDD_RED"
    And the saved session holds the hash of the feature file of "FR-CART-02", as it is in the worktree
    And the saved session holds no pending question
    And the project has no lock

  Scenario: Without a terminal, resume saves the pending review again, with the feature files as they were written
    Given "oid run --fr FR-CART-02" was run without a terminal and saved its question about the feature files
    When I run "oid resume" without a terminal
    Then the output asks to review the feature files, with the actions "approve", "edit" and "reject"
    And the process exits with code 3
    And the saved session holds the pending question about the feature files
    And the worktree has a feature file for "FR-CART-02"
    And the feature-writing agent was asked once in all
    And the project has no lock

  Scenario: After a crash, resume releases the lock of the dead process, discards what it left and runs the state again from its checkpoint
    Given the test-writing agent writes the file "tests/unit/half-done.test.ts" and then the process dies
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", and the process dies while the test-writing agent works
    Then the lock of the project is still held by the process that died
    And the worktree has the file "tests/unit/half-done.test.ts"
    When I run "oid resume" without a terminal
    Then the event log of the run records that the run was resumed at "TDD_RED"
    And that event lists "tests/unit/half-done.test.ts" as discarded
    And that event says the lock of a process that was not running was released
    And the worktree has no "tests/unit/half-done.test.ts"
    And the test-writing agent was asked twice, with the same task each time
    And the step-writing agent was asked once for "Add a line"
    And the event log of the run records a transition from "TDD_RED" to "CODE_GREEN"
    And the worktree has the commit "oid: checkpoint FR-CART-02 TDD_RED Add a line" with the unit test
    And the project has no lock

  Scenario: Resume continues the inner loop of a scenario at the state that died, with the unit test the run had recorded, and keeps the cost
    Given the agents report a cost of 0.01 dollars and 1000 tokens for each session
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the file "src/half-done.ts" and then the process dies
    And the coding agent then writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", and the process dies while the coding agent works
    And I run "oid resume" without a terminal
    Then the event log of the run records that the run was resumed at "CODE_GREEN"
    And that event lists "src/half-done.ts" as discarded
    And the test-writing agent was asked once in all
    And the coding agent was asked twice, with the same task each time
    And the event log of the run records a transition from "CODE_GREEN" to "BDD_CHECK"
    And the event log of the run records a transition from "BDD_CHECK" to "BDD_RED"
    And the saved session records the unit test "tests/unit/cart-lines.test.ts > cart lines > adds a line" for the scenario "Add a line"
    And the saved session records the cost of the run as 0.01 dollars and 1000 tokens for each agent session that the event log shows started

  Scenario: oid abort signals the process that holds the lock, and the run stops after its current step, at the checkpoint that step made
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the test-writing agent runs "oid abort" while it works
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process that holds the lock was signalled once
    And the event log of the run records a transition from "TDD_RED" to "CODE_GREEN"
    And the event log of the run records a transition from "CODE_GREEN" to "ABORTED"
    And the coding agent was not asked
    And the worktree has the commit "oid: checkpoint FR-CART-02 TDD_RED Add a line" with the unit test
    And the saved session has the state "CODE_GREEN"
    And the project has no lock
    And the worktree is kept

  Scenario: A run that was aborted is resumed at the state that was next, with nothing discarded
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the test-writing agent runs "oid abort" while it works
    And the coding agent writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    And I run "oid resume" without a terminal
    Then the event log of the run records a transition from "CODE_GREEN" to "ABORTED"
    And the event log of the run records that the run was resumed at "CODE_GREEN"
    And that event lists no discarded file
    And the test-writing agent was asked once in all
    And the event log of the run records a transition from "CODE_GREEN" to "BDD_CHECK"

  Scenario: A run aborted at the check of its last scenario is resumed there, and the feature is committed from the commit it started at
    Given the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing
    And the coding agent runs "oid abort" while it writes the code of the second scenario
    And the BDD runner replays the check of the last scenario once more for the resumed run
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    And I run "oid resume" without a terminal
    Then the event log of the run records a transition from "BDD_CHECK" to "ABORTED"
    And the event log of the run records that the run was resumed at "BDD_CHECK"
    And the event log of the run records a transition from "BDD_CHECK" to "QUALITY_GATE"
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"
    And the event log of the run records a transition from "FR_COMMIT" to "DONE"
    And the test-writing agent was asked twice in all
    And the run's branch has one commit since the start of the run, named "feat(cart): FR-CART-02 Feature FR-CART-02"
    And "FR-CART-02" is done in the progress file of the worktree
    And the project has no lock

  Scenario: oid abort has nothing to stop when no run holds the lock
    When I run "oid abort"
    Then the process exits with code 1
    And the error mentions "no run is in progress"
    And no process was signalled

  Scenario: oid abort does not signal a lock that a dead process left
    Given the lock of the project is held by a process that is no longer running
    When I run "oid abort"
    Then the process exits with code 1
    And the error mentions the lock, the process that is gone and that "oid resume" releases it
    And no process was signalled
    And the lock file is as it was

  Scenario: Resume has nothing to continue when no run saved a session
    When I run "oid resume" without a terminal
    Then the process exits with code 1
    And the error mentions "no run to resume"

  Scenario: Resume refuses a run that stopped before its features were selected, and leaves the session, the worktree and the lock as they were
    Given a saved session of an earlier run with a pending question
    When I run "oid resume" without a terminal
    Then the process exits with code 1
    And the error mentions "BASELINE"
    And the error mentions "oid run"
    And the saved session still names the run "earlier-run" with its pending question
    And the project has no lock file

  Scenario: The events of a resumed run carry the time each one happened
    Given "oid run --fr FR-CART-02" was run without a terminal and saved its question about the feature files
    When I run "oid resume" with a terminal where the human answers "approve"
    Then the events of the run from the resume on were stamped with the times they happened, not all the same

  @process
  Scenario: oid abort sends a real signal to the process that holds the lock
    Given the lock of the project is held by a process that is running
    When I run "oid abort"
    Then the process that holds the lock was stopped by the signal "SIGTERM"
