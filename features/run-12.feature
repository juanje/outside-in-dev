@FR-RUN-12
Feature: Clean up finished runs

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending

  Scenario: Cleaning without a run name removes every finished run but keeps its branches
    Given finished runs "committed-run", "unselected-run" and "replaced-run" with their worktrees, run data and branches
    And "committed-run" reached its commit and cannot be resumed
    And "unselected-run" stopped before its features were selected and cannot be resumed
    And "replaced-run" was replaced by a later run as the saved session and cannot be resumed
    When I run "oid clean"
    Then the worktrees of "committed-run", "unselected-run" and "replaced-run" are removed
    And the run data of "committed-run", "unselected-run" and "replaced-run" under ".outside-in/runs/" is removed
    And the branches of "committed-run", "unselected-run" and "replaced-run" are kept

  Scenario: Cleaning leaves a run that can be resumed and explains how to clean it
    Given a run "resumable-run" that can be resumed, with its worktree, run data and branch
    When I run "oid clean"
    Then the worktree and run data of "resumable-run" are kept
    And the output says to run "oid clean --run resumable-run" to clean it
    And the branch of "resumable-run" is kept

  Scenario: Naming a finished run cleans only that run
    Given finished runs "finished-run" and "other-run" with their worktrees, run data and branches
    And "finished-run" reached its commit and cannot be resumed
    And "other-run" reached its commit and cannot be resumed
    When I run "oid clean --run finished-run"
    Then the worktree and run data of "finished-run" are removed
    And the worktree and run data of "other-run" are kept
    And the branches of "finished-run" and "other-run" are kept

  Scenario: Naming a resumable run cleans it and removes its saved session
    Given a run "resumable-run" that can be resumed, with its worktree, run data and branch
    And the saved session names "resumable-run"
    When I run "oid clean --run resumable-run"
    Then the worktree and run data of "resumable-run" are removed
    And the saved session is removed
    And the branch of "resumable-run" is kept

  Scenario: Naming a run in progress never cleans it
    Given a run "active-run" is in progress, with its worktree, run data and branch
    When I run "oid clean --run active-run"
    Then the worktree and run data of "active-run" are kept
    And the branch of "active-run" is kept

  Scenario: A run whose process holds the lock is never touched even when named
    Given a run "locked-run" has a process holding the lock, with its worktree, run data and branch
    When I run "oid clean --run locked-run"
    Then the worktree and run data of "locked-run" are kept
    And the branch of "locked-run" is kept
    And the lock is still held by that process

  Scenario: Cleaning is refused when the project is not configured
    Given the project has no ".outside-in.json"
    When I run "oid clean"
    Then the error mentions ".outside-in.json"
    And no worktree or run data was removed

  Scenario: A failed worktree removal is reported without deleting the run data
    Given finished run "failed-clean" has a worktree that cannot be removed, its run data and branch
    When I run "oid clean --run failed-clean"
    Then the error mentions that the worktree of "failed-clean" could not be removed
    And the run data of "failed-clean" under ".outside-in/runs/" is kept
    And the branch of "failed-clean" is kept

  Scenario: Cleaning without a run name keeps a real run that stopped to wait for an answer
    Given the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And "oid run --fr FR-CART-02" was run without a terminal and saved its question about the feature files
    When I run "oid clean"
    Then the worktree and run data of the saved run are kept
    And the output says to run "oid clean --run" with the saved run to clean it

  Scenario: Naming a run that does not exist is refused
    When I run "oid clean --run no-such-run"
    Then the process exits with code 1
    And the error mentions "no-such-run"

  Scenario: A worktree that cannot be removed makes the command fail
    Given the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing
    And "oid run --fr FR-CART-02" ran to its commit with a terminal where the human answers "approve"
    And the worktree of that run cannot be removed
    When I run "oid clean"
    Then the process exits with code 1
    And the error mentions that the worktree of that run could not be removed
    And the run data of that run is kept

  Scenario: With the lock held, naming a run is refused and says which process holds the lock
    Given the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And "oid run --fr FR-CART-02" was run without a terminal and saved its question about the feature files
    And the lock of the project is held by a process that is running
    When I run "oid clean --run" with the saved run
    Then the process exits with code 1
    And the error mentions the lock and the process that holds it
    And the worktree and run data of the saved run are kept

  Scenario: Cleaning is refused when the project is not configured, and no run is touched
    Given the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And "oid run --fr FR-CART-02" was run without a terminal and saved its question about the feature files
    And the project has no ".outside-in.json"
    When I run "oid clean --run" with the saved run
    Then the process exits with code 1
    And the error mentions ".outside-in.json"
    And the worktree and run data of the saved run are kept
