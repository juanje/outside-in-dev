@FR-RUN-02
Feature: Write and review feature files

  Background:
    Given a git project with a green suite
    And SPEC.md has the requirements "FR-CART-01", "FR-CART-02" and "FR-CART-03", and the non-functional requirement "NFR-01"
    And progress.json tracks "FR-CART-01" as done and "FR-CART-02" and "FR-CART-03" as pending
    And the project has a DOMAIN.md and a feature file for "FR-CART-01"
    And the feature-writing agent writes a valid feature file for each requirement it is given

  Scenario: A feature file is written for each target feature
    When I run "oid run" with a terminal where the human answers "approve"
    Then the worktree has a feature file for "FR-CART-02" and one for "FR-CART-03"
    And the event log of the run records the transitions to "FEATURE_WRITE" and "FEATURE_REVIEW", in that order

  Scenario: The agent that writes a feature file gets the requirement and what it needs for style
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the agent's task includes the whole text of "FR-CART-02" and of "NFR-01"
    And the agent's task includes the DOMAIN.md of the project and the feature file of "FR-CART-01"
    And the agent's task includes no source file and no test

  Scenario: The agent works with the tools and the sandbox of feature writing
    Given the agent also tries to write "features/steps/cart.steps.ts" and "src/cart.ts"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the agent was refused both writes
    And the worktree has no "features/steps/cart.steps.ts" and no "src/cart.ts"
    And the agent had no shell tool

  Scenario: The human is asked once for all the feature files
    When I run "oid run" with a terminal where the human answers "approve"
    Then the human was asked exactly once
    And the question showed the text of the feature files of "FR-CART-02" and of "FR-CART-03"
    And the question named the worktree and offered the actions "approve", "edit" and "reject"

  Scenario: Approving the feature files ends the review
    When I run "oid run" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "FEATURE_REVIEW" to "BDD_RED"
    And a line printed says the feature files were approved and BDD Red is next
    And the saved session holds the hash of each feature file of "FR-CART-02" and "FR-CART-03", as they are in the worktree
    And the saved session holds no pending question
    And the project has no lock

  Scenario: Approving moves each target feature to BDD Red
    When I run "oid run" with a terminal where the human answers "approve"
    Then in the worktree "FR-CART-02" and "FR-CART-03" are in progress at the step "bdd_red"
    And "FR-CART-01" is still done
    And progress.json of the user's copy is as it was

  Scenario: Approving creates a checkpoint with the feature files
    When I run "oid run" with a terminal where the human answers "approve"
    Then the worktree has the commit "oid: checkpoint FR-CART-02 FR-CART-03 FEATURE_REVIEW" with the feature files and the progress update
    And the user's copy is on its own branch, at its own commit, with no change

  Scenario: The human edits the feature files and approves them
    When I run "oid run" with a terminal where the human edits "features/FR-CART-02.feature" adding a scenario "Remove a line" and answers "edit"
    Then the worktree has the commit "oid: human edit" with the edited file "features/FR-CART-02.feature"
    And the event log of the run records a human edit of "features/FR-CART-02.feature"
    And the saved session holds the hash of the edited "features/FR-CART-02.feature"

  Scenario: The human rejects the feature files with a comment
    When I run "oid run" with a terminal where the human answers "reject" with the comment "Cover the empty cart" and then "approve"
    Then the event log of the run records a transition from "FEATURE_REVIEW" to "FEATURE_WRITE"
    And the feature-writing agent was run again for "FR-CART-02" and for "FR-CART-03"
    And the second task of the agent for "FR-CART-02" includes the comment "Cover the empty cart"
    And the human was asked exactly twice

  Scenario: Without a terminal the review waits for an answer
    When I run "oid run" without a terminal
    Then the process exits with code 3
    And the output asks to review the feature files, with the actions "approve", "edit" and "reject"
    And the saved session has the state "FEATURE_REVIEW"
    And the saved session holds the pending question about the feature files
    And the saved session holds no hash of a feature file
    And the project has no lock

  Scenario: A requirement whose agent writes no feature file stops the run
    Given the feature-writing agent writes no file for "FR-CART-03"
    When I run "oid run" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the human was not asked

  Scenario: An agent that is blocked stops the run
    Given the feature-writing agent reports that it is blocked with the reason "FR-CART-02 contradicts FR-CART-03"
    When I run "oid run" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "FR-CART-02 contradicts FR-CART-03"
    And the saved session has the state "FEATURE_WRITE"
    And the worktree is kept

  Scenario: A report that does not match the changed files stops the run
    Given the feature-writing agent changes a file it does not report
    When I run "oid run" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "the report does not match"
    And the human was not asked

  Scenario Outline: A feature file that fails a gate stops the run
    Given the feature-writing agent writes for "FR-CART-02" a feature file <problem>
    When I run "oid run" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "FR-CART-02" and "<reason>"
    And the saved session has the state "FEATURE_WRITE"
    And the human was not asked

    Examples:
      | problem                                   | reason                         |
      | that is not valid Gherkin                 | does not parse                 |
      | with no scenario                          | no scenario                    |
      | whose scenario is tagged "@FR-CART-03"    | is not traced to FR-CART-02    |
      | whose scenario has no requirement tag     | is not traced to FR-CART-02    |
      | whose scenario is tagged "@NFR-09"        | NFR-09 is not in SPEC.md       |
