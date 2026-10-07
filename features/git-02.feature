@FR-GIT-02
Feature: Checkpoint and roll back

  Background:
    Given a project repository with a committed file "README.md" and a lockfile "package-lock.json" containing "lock A"

  Scenario: A checkpoint commits the work on the run's branch and leaves the user's copy alone
    Given a run started and named "login"
    And the run's worktree has a new file "src/login.ts"
    When a checkpoint is made for "FR-AUTH-01" at the state "bdd_red" for the scenario "Log in"
    Then the run's branch has one new commit named "oid: checkpoint FR-AUTH-01 bdd_red Log in" holding "src/login.ts"
    And the user's copy is unchanged, on its own branch

  Scenario: A checkpoint without a scenario names only the feature and the state
    Given a run started and named "login"
    And the run's worktree has a new file "src/login.ts"
    When a checkpoint is made for "FR-AUTH-01" at the state "refactor"
    Then the run's branch has one new commit named "oid: checkpoint FR-AUTH-01 refactor" holding "src/login.ts"

  Scenario: A checkpoint with nothing changed makes no commit
    Given a run started and named "login"
    When a checkpoint is made for "FR-AUTH-01" at the state "select"
    Then the run's branch has no new commit
    And the checkpoint is the start commit

  Scenario: Rolling back returns to the checkpoint and removes what the step wrote
    Given a run started and named "login"
    And the run's worktree has a new file "src/login.ts"
    And a checkpoint was made for "FR-AUTH-01" at the state "tdd_green"
    And the file "src/login.ts" of the run's worktree is changed
    And the run's worktree has a new file "src/extra.ts"
    When the run is rolled back to the checkpoint, cleaning "src/**"
    Then the file "src/login.ts" of the run's worktree has its checkpointed content
    And the file "src/extra.ts" of the run's worktree does not exist
    And the run's branch is at the checkpoint
    And the user's copy is unchanged, on its own branch

  Scenario: Files outside the writable paths survive a rollback
    Given a run started and named "login"
    And a checkpoint was made for "FR-AUTH-01" at the state "select"
    And the run's worktree has a new file "notes/todo.txt"
    And the run's worktree has a new file "src/extra.ts"
    When the run is rolled back to the checkpoint, cleaning "src/**"
    Then the file "notes/todo.txt" of the run's worktree still exists
    And the file "src/extra.ts" of the run's worktree does not exist

  Scenario: Ignored files survive a rollback even inside the writable paths
    Given a run started and named "login"
    And a checkpoint was made for "FR-AUTH-01" at the state "select"
    And the run's worktree has a new file "node_modules/dep/index.js"
    When the run is rolled back to the checkpoint, cleaning "node_modules/**"
    Then the file "node_modules/dep/index.js" of the run's worktree still exists

  Scenario: A checkpoint is refused on the user's own branch
    Given the user's copy has an untracked file "src/notes.txt"
    And the work is in the user's own copy
    When a checkpoint is made for "FR-AUTH-01" at the state "select"
    Then the run is refused with a message containing "the branch \"main\" is not a run's branch"
    And the user's copy is unchanged, on its own branch

  Scenario: A rollback is refused on the user's own branch
    Given the user's copy has an untracked file "src/notes.txt"
    And the work is in the user's own copy
    When the run is rolled back to the start of the run, cleaning "src/**"
    Then the run is refused with a message containing "the branch \"main\" is not a run's branch"
    And the user's copy is unchanged, on its own branch
