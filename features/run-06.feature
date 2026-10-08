@FR-RUN-06
Feature: Quality gate

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing

  Scenario: With the real runners, the formatter and the linter fix the code, every check passes and the feature moves on to its commit
    Given the project formats its source with a formatter that removes trailing spaces
    And the project lints its source with a linter that reports every TODO comment
    And the coding agent leaves trailing spaces in the cart code of the second scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the baseline of the run records no lint error, no type error and no traceability violation
    And the worktree has the commit "oid: checkpoint FR-CART-02 QUALITY_GATE autofix" with the cart code without trailing spaces
    And the event log of the run records a transition from "BDD_CHECK" to "QUALITY_GATE"
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"
    And in the commit "oid: checkpoint FR-CART-02 QUALITY_GATE" progress.json records "Add a line" as "pass" and "Remove a line" as "pass"

  Scenario: A lint error the run introduced goes to the coding agent, and what the project already had is not asked about
    Given the project lints its source with a linter that reports every TODO comment
    And "src/totals.ts" holds a TODO comment when the run starts
    And a feature file of the project has a scenario with no requirement tag when the run starts
    And the coding agent leaves a TODO comment in the cart code of the second scenario, and removes it when it is asked to fix the lint error
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the baseline of the run lists the lint error "no-todo" of "src/totals.ts" and one traceability violation
    And the event log of the run records a transition from "QUALITY_GATE" to "QUALITY_FIX" whose reason mentions "1 lint error"
    And the third task of the coding agent lists the lint error "no-todo" of "src/cart.ts" and the file in full
    And the third task of the coding agent does not mention "src/totals.ts"
    And the worktree has the commit "oid: checkpoint FR-CART-02 QUALITY_FIX" with the cart code without the TODO comment
    And the event log of the run records a transition from "QUALITY_FIX" to "QUALITY_GATE"
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"

  Scenario: A type error the run introduced in a unit test goes to the test-writing agent, with the tools and the sandbox of TDD Red
    Given the type check finds an error in the unit test "tests/unit/cart-lines.test.ts" after the last Code Green, and none once it is fixed
    And the test-writing agent fixes the unit test when it is asked to fix the type error
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "QUALITY_GATE" to "QUALITY_FIX" whose reason mentions "1 type error"
    And the third task of the test-writing agent lists the type error "TS2322" of "tests/unit/cart-lines.test.ts" and the file in full
    And the coding agent was asked only twice
    And the test-writing agent had no shell tool
    And the worktree has the commit "oid: checkpoint FR-CART-02 QUALITY_FIX" with the fixed unit test
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"

  Scenario: Errors that are still there after the fix are put to the human, who can see the whole output and abort
    Given the project lints its source with a linter that reports every TODO comment
    And the coding agent leaves a TODO comment in the cart code of the second scenario, and leaves it when it is asked to fix the lint error
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "view" and "abort"
    Then the coding agent was asked to fix the lint error once
    And the human was asked twice what to do about the quality gate, with the actions "view", "edit" and "abort"
    And the second question about the quality gate showed the whole output of the linter
    And the event log of the run records a transition from "QUALITY_GATE" to "ABORTED"
    And the process exits with code 2
    And the run never reaches "FR_COMMIT"
    And the saved session has the state "QUALITY_GATE"

  Scenario Outline: A check that no agent owns puts the question to the human, with what failed
    Given <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the quality gate, with the actions "view", "edit" and "abort"
    And the question about the quality gate mentions "<named>"
    And no agent was asked to fix anything
    And the event log of the run records a transition from "QUALITY_GATE" to "ABORTED"
    And the process exits with code 2
    And the run never reaches "FR_COMMIT"

    Examples:
      | problem                                                                                     | named                  |
      | the full BDD run finds the scenario "Add to cart" of "FR-CART-01" failing                   | Add to cart            |
      | the full unit run finds the unit test "starts at zero" failing                              | starts at zero         |
      | the project has an extra check that prints "the bundle is too big" and fails                | the bundle is too big  |
