@FR-GIT-03
Feature: One commit per feature

  Background:
    Given a project repository with a committed file "README.md" and a lockfile "package-lock.json" containing "lock A"

  Scenario: The checkpoints of a feature become one commit that names the requirement and lists its scenarios
    Given a run started and named "login"
    And the run's worktree has a new file "src/login.ts"
    And a checkpoint was made for "FR-AUTH-01" at the state "bdd_red" for the scenario "Log in"
    And the file "src/login.ts" of the run's worktree is changed
    And a checkpoint was made for "FR-AUTH-01" at the state "tdd_green" for the scenario "Log in"
    When the feature "FR-AUTH-01" titled "Log in with a password" is squashed with the scenarios "Log in, Reject a wrong password"
    Then the run's branch has one commit since the start, named "feat(auth): FR-AUTH-01 Log in with a password" and holding "src/login.ts"
    And the commit lists the scenarios "Log in, Reject a wrong password", one per line
    And the file "src/login.ts" of the run's worktree has its changed content
    And the user's copy is unchanged, on its own branch

  Scenario: The commit message follows the template of the project configuration
    Given the project configuration sets the commit template "{type}: {id} - {title} [{scope}]"
    And a run started and named "login"
    And the run's worktree has a new file "src/login.ts"
    And a checkpoint was made for "FR-AUTH-01" at the state "tdd_green"
    When the feature "FR-AUTH-01" titled "Log in" is squashed with the scenarios "Log in"
    Then the run's branch has one commit since the start, named "feat: FR-AUTH-01 - Log in [auth]" and holding "src/login.ts"

  Scenario: A feature with no checkpoint is not squashed
    Given a run started and named "login"
    When the feature "FR-AUTH-01" titled "Log in" is squashed with the scenarios "Log in"
    Then the run is refused with a message containing "nothing to squash"
    And the run's branch has no new commit

  Scenario: Squashing is refused on the user's own branch
    Given the user's copy has an untracked file "src/notes.txt"
    And the work is in the user's own copy
    When the feature "FR-AUTH-01" titled "Log in" is squashed with the scenarios "Log in"
    Then the run is refused with a message containing "the branch \"main\" is not a run's branch"
    And the user's copy is unchanged, on its own branch
