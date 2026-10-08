@FR-RUN-05
Feature: Refactor after each Green

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the test-writing agent writes the unit test "cart lines > adds a line", and it fails because the cart code does not exist yet

  Scenario: A Green with no finding on the lines it changed starts no refactoring agent
    Given the coding agent writes the cart code that passes the unit test and the scenario
    And the detectors find nothing
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the detectors ran once, after Code Green
    And the event log of the run records a transition from "CODE_GREEN" to "BDD_CHECK"
    And the event log of the run records no transition from "CODE_GREEN" to "REFACTOR"
    And the refactoring agent was never started
    And the worktree has no commit "oid: checkpoint FR-CART-02 REFACTOR Add a line"

  Scenario: Findings on the lines a Green changed are fixed by the refactoring agent, and the result is checkpointed
    Given the coding agent writes the cart code that passes the unit test and the scenario
    And the detectors find a magic value in "src/cart.ts"
    And the refactoring agent writes the cart code without the magic value, and the detectors find nothing afterwards
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "CODE_GREEN" to "REFACTOR" whose reason mentions "1 finding"
    And the event log of the run records a transition from "REFACTOR" to "BDD_CHECK" whose reason mentions "accepted"
    And the worktree has the commit "oid: checkpoint FR-CART-02 CODE_GREEN Add a line" with the cart code
    And the worktree has the commit "oid: checkpoint FR-CART-02 REFACTOR Add a line" with the refactored cart code
    And in the commit "oid: checkpoint FR-CART-02 BDD_CHECK Add a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pending"
    And the saved session lists no pending findings

  Scenario: The refactoring agent gets the list of findings with their code and the reuse catalogue, and works with the shell and the sandbox of Refactor
    Given the coding agent writes the cart code that passes the unit test and the scenario
    And the detectors find a magic value in "src/cart.ts"
    And the detectors also find a stale documentation comment in "src/cart.ts"
    And the refactoring agent also tries to write "tests/unit/cart-lines.test.ts" and "features/FR-CART-02.feature"
    And the refactoring agent writes the cart code without the magic value, and the detectors find nothing afterwards
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the first task of the refactoring agent lists the magic value and the stale documentation comment of "src/cart.ts", each with its lines and the code of those lines
    And the first task of the refactoring agent includes the signature of "countCartLines" with its description
    And the first task of the refactoring agent includes no unit test
    And the refactoring agent was refused both writes
    And the unit test "tests/unit/cart-lines.test.ts" is as the test-writing agent wrote it
    And the refactoring agent had a shell tool

  Scenario: A finding on lines the Green did not change, and a finding the baseline of the project holds, are not given to the agent
    Given the coding agent writes the cart code that passes the unit test and the scenario
    And the detectors find a magic value in "src/cart.ts"
    And the detectors also find a magic value in "src/totals.ts", which the Green did not change
    And the detectors also find a stale documentation comment in "src/cart.ts", which was already there when the run started
    And the refactoring agent writes the cart code without the magic value, and the detectors find nothing afterwards
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the first task of the refactoring agent lists the magic value of "src/cart.ts"
    And the first task of the refactoring agent does not list the magic value of "src/totals.ts" or the stale documentation comment
    And the event log of the run records a transition from "CODE_GREEN" to "REFACTOR" whose reason mentions "1 finding"

  Scenario Outline: A refactor that does not meet the criteria is rolled back, and its findings wait for the feature refactor
    Given the coding agent writes the cart code that passes the unit test and the scenario
    And the detectors find a magic value in "src/cart.ts"
    And the refactoring agent's attempt goes wrong because <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "REFACTOR" to "BDD_CHECK" whose reason mentions "rolled back"
    And the event log of the run records a transition from "REFACTOR" to "BDD_CHECK" whose reason mentions "<reason>"
    And the refactor raised no error
    And the worktree has no commit "oid: checkpoint FR-CART-02 REFACTOR Add a line"
    And the cart code of the worktree is as the coding agent wrote it
    And the saved session lists one pending finding, the magic value of "src/cart.ts"
    And in the commit "oid: checkpoint FR-CART-02 BDD_CHECK Add a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pending"

    Examples:
      | problem                                          | reason                                    |
      | its code has a type error                        | error TS2322                              |
      | its code makes a unit test fail                  | adds a line                               |
      | its code breaks the scenario "Add to cart"       | Add to cart                               |
      | its code leaves the finding where it was         | the finding is still there                |
      | its code brings a new finding                    | a new finding                             |
      | its code is more complex than before             | more complex                              |
      | it changes the unit test                         | changed a test while writing code         |

  Scenario Outline: A refactoring agent that is blocked or whose provider fails is treated as a rejected refactor
    Given the coding agent writes the cart code that passes the unit test and the scenario
    And the detectors find a magic value in "src/cart.ts"
    And the refactoring agent <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "REFACTOR" to "BDD_CHECK" whose reason mentions "rolled back"
    And the event log of the run records a transition from "REFACTOR" to "BDD_CHECK" whose reason mentions "<reason>"
    And the refactor raised no error
    And the worktree has no commit "oid: checkpoint FR-CART-02 REFACTOR Add a line"
    And the saved session lists one pending finding, the magic value of "src/cart.ts"
    And in the commit "oid: checkpoint FR-CART-02 BDD_CHECK Add a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pending"

    Examples:
      | problem                                                                        | reason                              |
      | reports that it is blocked with the reason "the cart needs a payment service"  | the cart needs a payment service    |
      | cannot reach its provider                                                      | the provider failed                 |

  Scenario: A refactor is accepted after a Green that leaves the scenario still red
    Given the coding agent writes the cart code that passes the unit test, but the scenario still fails
    And the detectors find a magic value in "src/cart.ts"
    And the refactoring agent writes the cart code without the magic value, and the detectors find nothing afterwards
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "CODE_GREEN" to "REFACTOR" whose reason mentions "1 finding"
    And the worktree has the commit "oid: checkpoint FR-CART-02 REFACTOR Add a line" with the refactored cart code
    And the event log of the run records a transition from "BDD_CHECK" to "TDD_RED"

  Scenario: With the real detectors and the real runners, a magic value that Code Green left is named by the refactoring agent
    Given the coding agent writes cart code with a magic number that passes the unit test and the scenario
    And the refactoring agent replaces the magic number with a named constant
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the first task of the refactoring agent lists a magic value of "src/cart.ts"
    And the event log of the run records a transition from "REFACTOR" to "BDD_CHECK" whose reason mentions "accepted"
    And the worktree has the commit "oid: checkpoint FR-CART-02 REFACTOR Add a line" with the refactored cart code
