@FR-GIT-02
Feature: A run's checkpoints are oid's own bookkeeping: no project hook judges them, and a git failure ends the run with an error

  Background:
    Given a git project with a green suite
    And SPEC.md has the requirements "FR-CART-01", "FR-CART-02" and "FR-CART-03"
    And progress.json tracks "FR-CART-01" as done and "FR-CART-02" and "FR-CART-03" as pending
    And the project has a DOMAIN.md and a feature file for "FR-CART-01"
    And the feature-writing agent writes a valid feature file for each requirement it is given

  @run
  Scenario: A checkpoint is made although the project's pre-commit hook refuses every commit
    Given the project's git hook "pre-commit" exits with 1
    When I run "oid run" with a terminal where the human answers "approve"
    Then the worktree has the commit "oid: checkpoint FR-CART-02 FR-CART-03 FEATURE_REVIEW" with the feature files and the progress update
    And the saved session has the state "BDD_RED"

  @run
  Scenario: A checkpoint runs none of the project's git hooks
    Given the project's git hook "post-commit" records that it ran
    When I run "oid run" with a terminal where the human answers "approve"
    Then the worktree has the commit "oid: checkpoint FR-CART-02 FR-CART-03 FEATURE_REVIEW" with the feature files and the progress update
    And the git hook "post-commit" of the project did not run

  @run
  Scenario: A git command that fails at a checkpoint ends the run with an error and leaves it resumable
    Given every commit of the project fails
    When I run "oid run" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "commit" and "failed"
    And the saved session has the state "FEATURE_REVIEW"
    And the project has no lock
