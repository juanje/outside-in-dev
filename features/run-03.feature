@FR-RUN-03
Feature: BDD Red

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of the scenario it is given, and they fail because the cart code does not exist yet

  Scenario: A scenario that fails because the code is missing is checkpointed and moves the run to TDD Red
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records a transition from "BDD_RED" to "TDD_RED"
    And the worktree has the commit "oid: checkpoint FR-CART-02 BDD_RED Add a line" with the step definitions and the progress update
    And in the commit "oid: checkpoint FR-CART-02 BDD_RED Add a line" progress.json records "Add a line" as "fail" and "Remove a line" as "pending"

  Scenario: The agent that writes steps gets the first scenario and what it needs for reuse
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the first task of the step-writing agent includes the scenario "Add a line" and its location "features/FR-CART-02.feature:3"
    And the first task of the step-writing agent includes the step definitions that exist and the signature of "countLines" with its description
    And the first task of the step-writing agent includes neither the scenario "Remove a line", nor a unit test, nor the body of "countLines"

  Scenario: The agent works with the tools and the sandbox of BDD Red
    Given the step-writing agent also tries to write "src/cart.ts" and "features/FR-CART-02.feature"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the step-writing agent was refused both writes
    And the worktree has no "src/cart.ts"
    And the feature file of "FR-CART-02" is as it was approved
    And the agent had no shell tool

  Scenario: A change that breaks a scenario that passes stops the run
    Given the step-writing agent also changes the step "the cart is not empty" so that it fails
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add to cart" and "the cart is not empty"
    And the run never reaches "TDD_RED"
    And the saved session has the state "BDD_RED"
    And the worktree is kept

  Scenario Outline: A scenario that is not a valid Red stops the run
    Given the step-writing agent writes steps where <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add a line" and "<reason>"
    And the run never reaches "TDD_RED"
    And the saved session has the state "BDD_RED"

    Examples:
      | problem                         | reason                                  |
      | the scenario passes at once     | passes without new implementation       |
      | one step has no definition      | did not run (status UNDEFINED)          |

  Scenario: Steps that import code that does not exist yet stop the run
    Given the step-writing agent writes a step file that imports "../../src/cart.js" statically
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "features/steps/cart-lines.steps.ts" and "import it dynamically"
    And the run never reaches "TDD_RED"
    And the saved session has the state "BDD_RED"

  Scenario Outline: A change outside the step definitions stops the run
    Given the step-writing agent changes "<file>" without the sandbox noticing
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "<file>" and "<reason>"
    And the run never reaches "TDD_RED"

    Examples:
      | file                        | reason                                  |
      | src/cart.ts                 | changed source code while writing tests |
      | features/FR-CART-02.feature | changed an approved feature file        |

  Scenario: An agent that is blocked stops the run
    Given the step-writing agent reports that it is blocked with the reason "the scenario needs a payment service"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "the scenario needs a payment service"
    And the saved session has the state "BDD_RED"
    And the worktree is kept

  Scenario: A report that does not match the changed files stops the run
    Given the step-writing agent changes a file it does not report
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "the report does not match"
    And the run never reaches "TDD_RED"

  Scenario: A failure oid cannot classify is put to the human, who decides it is a valid Red
    Given the step-writing agent writes steps that fail with an error that is not an assertion
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve", "trace" and "valid"
    Then the human was asked twice about the Red of "Add a line", with the actions "valid", "bug" and "trace"
    And the second question about the Red showed the whole failure, with its stack
    And the event log of the run records a transition from "BDD_RED" to "TDD_RED"
    And the worktree has the commit "oid: checkpoint FR-CART-02 BDD_RED Add a line" with the step definitions and the progress update

  Scenario: The human decides that the failure is a bug in the step definitions
    Given the step-writing agent writes steps that fail with an error that is not an assertion
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "bug"
    Then the process exits with code 1
    And the event log of the run records an error mentioning "Add a line" and "bug in the step definitions"
    And the run never reaches "TDD_RED"
    And the saved session has the state "BDD_RED"

  Scenario: The question about a failure oid cannot classify names the failing step and shows what the scenario recorded
    Given the step-writing agent writes steps that fail with an error that is not an assertion, and the run of the scenario attached the output of the cart
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "bug"
    Then the first question about the Red names the step "When a line is added" at line 5 of "features/FR-CART-02.feature"
    And the first question about the Red shows the output "the cart refused the line"
