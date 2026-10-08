@FR-RUN-04
Feature: TDD inner loop

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet

  Scenario: A failing unit test and the code that passes it turn the scenario green, and the run goes on to the next scenario
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "TDD_RED" to "CODE_GREEN"
    And the event log of the run records a transition from "CODE_GREEN" to "BDD_CHECK"
    And the event log of the run records a transition from "BDD_CHECK" to "BDD_RED"
    And the worktree has the commit "oid: checkpoint FR-CART-02 TDD_RED Add a line" with the unit test
    And the worktree has the commit "oid: checkpoint FR-CART-02 CODE_GREEN Add a line" with the cart code
    And in the commit "oid: checkpoint FR-CART-02 BDD_CHECK Add a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pending"
    And the saved session records the unit test "tests/unit/cart-lines.test.ts > cart lines > adds a line" for the scenario "Add a line"

  Scenario: The test-writing agent gets the scenario and its failure, and works with the tools and the sandbox of TDD Red
    Given the test-writing agent also tries to write "src/cart.ts" and "features/FR-CART-02.feature"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the first task of the test-writing agent includes the scenario "Add a line" and its location "features/FR-CART-02.feature:3"
    And the first task of the test-writing agent includes the failure of the scenario and the signature of "countLines" with its description
    And the first task of the test-writing agent includes neither the scenario "Remove a line" nor the body of "countLines"
    And the test-writing agent was refused both writes
    And the worktree has no "src/cart.ts"
    And the feature file of "FR-CART-02" is as it was approved
    And the test-writing agent had no shell tool

  Scenario Outline: A unit test that is not a valid Red stops the run
    Given the test-writing agent's attempt goes wrong because <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add a line" and "<reason>"
    And the run never reaches "CODE_GREEN"
    And the worktree has no commit "oid: checkpoint FR-CART-02 TDD_RED Add a line"
    And the saved session has the state "TDD_RED"
    And the worktree is kept

    Examples:
      | problem                                              | reason                                  |
      | it writes no unit test                               | the report names no unit test           |
      | its unit test passes at once                         | passes without new implementation       |
      | it reports a unit test that is not in the file       | no test named                           |
      | its unit test breaks another one that passed         | unit tests that passed no longer pass   |
      | it also changes "src/cart.ts" without the sandbox noticing | changed source code while writing tests |

  Scenario: A unit test failure oid cannot classify is put to the human, who decides it is a valid Red
    Given the test-writing agent writes a unit test that fails with an error that is not an assertion
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "trace" and "valid"
    Then the human was asked twice about the Red of the unit test "cart lines > adds a line", with the actions "valid", "bug" and "trace"
    And the second question about the unit test showed the whole failure, with its stack
    And the event log of the run records a transition from "TDD_RED" to "CODE_GREEN"
    And the worktree has the commit "oid: checkpoint FR-CART-02 TDD_RED Add a line" with the unit test

  Scenario: The human decides that the failure is a bug in the unit test
    Given the test-writing agent writes a unit test that fails with an error that is not an assertion
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "bug"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add a line" and "bug in the unit test"
    And the run never reaches "CODE_GREEN"
    And the saved session has the state "TDD_RED"

  Scenario: The coding agent gets the failing unit test and the code it imports, and works with the shell and the sandbox of Code Green
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent also tries to write "tests/unit/cart-lines.test.ts" and "features/FR-CART-02.feature"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the first task of the coding agent includes the unit test "tests/unit/cart-lines.test.ts" and its failure
    And the first task of the coding agent includes the body of "countLines" and the signature of "countLines" with its description
    And the first task of the coding agent does not include the scenario "Remove a line"
    And the coding agent was refused both writes
    And the unit test "tests/unit/cart-lines.test.ts" is as the test-writing agent wrote it
    And the coding agent had a shell tool

  Scenario Outline: Code that is not a valid Green stops the run
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent's attempt goes wrong because <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add a line" and "<reason>"
    And the run never reaches "BDD_CHECK"
    And the worktree has no commit "oid: checkpoint FR-CART-02 CODE_GREEN Add a line"
    And the saved session has the state "CODE_GREEN"
    And the worktree is kept

    Examples:
      | problem                                       | reason                              |
      | it changes the unit test                      | changed a test while writing code   |
      | its code does not make the unit test pass     | adds a line                         |
      | its code has a type error                     | error TS2322                        |

  Scenario: A scenario that is still red after the code is written starts another iteration
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test, but the scenario still fails
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "CODE_GREEN" to "BDD_CHECK"
    And the event log of the run records a transition from "BDD_CHECK" to "TDD_RED"
    And the worktree has the commit "oid: checkpoint FR-CART-02 CODE_GREEN Add a line" with the cart code
    And in the commit "oid: checkpoint FR-CART-02 CODE_GREEN Add a line" progress.json records "Add a line" as "fail" and "Remove a line" as "pending"
    And the second task of the test-writing agent includes the failure of the scenario after the code was written

  Scenario: Code that breaks a scenario that passed is a failure of Code Green
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test, but breaks the scenario "Add to cart"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add to cart" and "Code Green"
    And the saved session has the state "CODE_GREEN"
    And the event log of the run records no transition from "BDD_CHECK" to "BDD_RED"
    And progress.json of the worktree records "Add a line" as "fail"

  Scenario: An agent with no unit logic left sends the run to Code Green with the failure of the scenario
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the coding agent writes the cart code that passes the unit test, but the scenario still fails
    And the test-writing agent then reports that no unit logic is left
    And the coding agent then writes the wiring that makes the scenario pass
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "TDD_RED" to "CODE_GREEN" whose reason mentions "integration_step"
    And the second task of the coding agent includes the failure of the scenario after the code was written
    And in the commit "oid: checkpoint FR-CART-02 BDD_CHECK Add a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pending"

  Scenario: An agent with no unit logic left is refused when the scenario has no unit test yet
    Given the test-writing agent reports that no unit logic is left
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add a line" and "at least one unit test"
    And the run never reaches "CODE_GREEN"
    And the saved session has the state "TDD_RED"

  Scenario: A scenario that is still red after the last iteration stops the run to ask what to do
    Given the project limits the inner loop to 2 iterations for each scenario
    And the agents write two unit tests and two pieces of cart code, and the scenario still fails after both
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do with "Add a line", after 2 iterations, with the actions "retry", "rewrite", "skip_scenario", "skip_fr" and "abort"
    And the event log of the run records a transition from "BDD_CHECK" to "TDD_RED" once
    And the event log of the run records a transition from "BDD_CHECK" to "ABORTED"
    And the process exits with code 2
    And the saved session has the state "BDD_CHECK"

  Scenario: When every scenario of the requirement passes, each has its checkpoint and the progress file records them
    Given the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "BDD_CHECK" to "BDD_RED"
    And in the commit "oid: checkpoint FR-CART-02 BDD_CHECK Add a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pending"
    And in the commit "oid: checkpoint FR-CART-02 BDD_CHECK Remove a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pass"
    And the saved session records the unit test "tests/unit/cart-lines.test.ts > cart lines > adds a line" for the scenario "Add a line"
    And the saved session records the unit test "tests/unit/cart-lines.test.ts > cart lines > removes a line" for the scenario "Remove a line"

  Scenario Outline: An agent that is blocked or whose provider fails stops the run
    Given the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet
    And the <agent> agent <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add a line" and "<reason>"
    And the run never reaches "<next>"
    And the saved session has the state "<state>"
    And the worktree is kept

    Examples:
      | agent        | problem                                                                          | reason                              | next        | state      |
      | test-writing | reports that it is blocked with the reason "the cart needs a payment service"    | the cart needs a payment service    | CODE_GREEN  | TDD_RED    |
      | coding       | reports that it is blocked with the reason "the cart needs a payment service"    | the cart needs a payment service    | BDD_CHECK   | CODE_GREEN |
      | test-writing | cannot reach its provider                                                        | the provider failed                 | CODE_GREEN  | TDD_RED    |
      | coding       | cannot reach its provider                                                        | the provider failed                 | BDD_CHECK   | CODE_GREEN |
