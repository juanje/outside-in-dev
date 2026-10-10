@FR-GIT-01
Feature: Work in an isolated worktree

  Background:
    Given a project repository with a committed file "README.md" and a lockfile "package-lock.json" containing "lock A"

  Scenario: A run starts in its own worktree and branch and the user's copy is unchanged
    When a run starts and is named "login"
    Then the work happens in a worktree outside the user's copy, on the branch "oid/login"
    And the worktree holds the committed files
    And the run reports the commit the user's copy was at
    And the user's copy is unchanged, on its own branch

  Scenario: A run without a name gets a branch named after the time it started
    When a run starts without a name at 2026-10-07 13:45:09
    Then the work happens on the branch "oid/run-20261007-134509"

  Scenario: A run refuses a branch that already exists
    Given a branch "oid/login" already exists
    When a run starts and is named "login"
    Then the run is refused with a message containing "oid/login"
    And no worktree was created

  Scenario: A run refuses a worktree directory that already exists
    Given the worktree directory of the run "run-1" already exists
    When a run with the identifier "run-1" starts and is named "login"
    Then the run is refused with a message containing "run-1"
    And the branch "oid/login" does not exist

  Scenario: The project settings choose the branch prefix and the worktree directory
    Given the project configuration sets the branch prefix "work/" and the worktree directory "../elsewhere"
    When a run starts and is named "login"
    Then the work happens in a worktree under "elsewhere", on the branch "work/login"

  Scenario: A run shares the installed dependencies while the lockfile is unchanged
    Given the user's copy has installed dependencies
    When a run starts and is named "login"
    Then the worktree's dependencies are the user's copy's dependencies

  Scenario: The shared dependencies are never seen by git in the worktree
    Given the project ignores its dependencies with the pattern "node_modules/"
    And the user's copy has installed dependencies
    When a run starts and is named "login"
    Then the worktree's dependencies are the user's copy's dependencies
    And git reports no untracked files in the worktree

  Scenario: A run installs its own dependencies when the lockfile differs
    Given the user's copy has installed dependencies
    And the lockfile of the user's copy has uncommitted differences from the committed one
    When a run starts and is named "login"
    Then the worktree's dependencies are installed by "npm ci" in the worktree

  Scenario: Working in place needs a clean copy
    Given the project is configured to work in place
    And the user's copy has an untracked file "notes.txt"
    When a run starts and is named "login"
    Then the run is refused with a message containing "notes.txt"
    And the branch "oid/login" does not exist

  Scenario: Working in place creates the branch in the user's copy
    Given the project is configured to work in place
    When a run starts and is named "login"
    Then the user's copy is on the branch "oid/login"

  Scenario: A finished run's worktree can be removed
    Given a run started and named "login"
    When the run's worktree is removed
    Then the worktree directory no longer exists
    And the user's copy is unchanged, on its own branch
