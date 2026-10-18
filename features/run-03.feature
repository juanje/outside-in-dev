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
    Given the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the step-writing agent, when it writes the steps of "Remove a line", also changes the step "a line is added" so that it fails
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records an error mentioning "Add a line" and "a line is added"
    And the run never reaches "TDD_RED" for "Remove a line"
    And the worktree is kept

  Scenario: The scenarios of other features are not run when the steps are written
    Given the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the BDD runner was asked to run, while the steps of "Add a line" were written, only the scenario "Add a line"
    And the BDD runner was asked to run, while the steps of "Remove a line" were written, only the scenarios "Remove a line" and "Add a line"
  Scenario Outline: A scenario that is not a valid Red stops the run
    Given the step-writing agent writes steps where <problem>
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records an error mentioning "Add a line" and "<reason>"
    And the run never reaches "TDD_RED"

    Examples:
      | problem                         | reason                                  |
      | one step has no definition      | did not run (status UNDEFINED)          |

  Scenario: Steps that import code that does not exist yet stop the run
    Given the step-writing agent writes a step file that imports "../../src/cart.js" statically
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records an error mentioning "features/steps/cart-lines.steps.ts" and "import it dynamically"
    And the run never reaches "TDD_RED"

  Scenario Outline: A change outside the step definitions stops the run
    Given the step-writing agent changes "<file>" without the sandbox noticing
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records an error mentioning "<file>" and "<reason>"
    And the run never reaches "TDD_RED"

    Examples:
      | file                        | reason                                  |
      | src/cart.ts                 | changed source code while writing tests |
      | features/FR-CART-02.feature | changed an approved feature file        |

  Scenario: An agent that is blocked asks the human what to do
    Given the step-writing agent reports that it is blocked with the reason "the scenario needs a payment service"
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "abort"
    Then the human was asked once what to do about the blocked agent of "Add a line" at "BDD_RED", with the actions "retry", "skip_scenario", "skip_fr" and "abort"
    And the question about the blocked agent mentions "the scenario needs a payment service"
    And the event log of the run records a transition from "BDD_RED" to "ABORTED"
    And the worktree is kept

  Scenario: A report that does not match the changed files stops the run
    Given the step-writing agent changes a file it does not report
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the event log of the run records an error mentioning "the report does not match"
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
    Then the event log of the run records an error mentioning "Add a line" and "bug in the step definitions"
    And the run never reaches "TDD_RED"

  Scenario: The question about a failure oid cannot classify names the failing step and shows what the scenario recorded
    Given the step-writing agent writes steps that fail with an error that is not an assertion, and the run of the scenario attached the output of the cart
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and then "bug"
    Then the first question about the Red names the step "When a line is added" at line 5 of "features/FR-CART-02.feature"
    And the first question about the Red shows the output "the cart refused the line"

  Scenario: A scenario that passes at once is put to the human, who accepts it as a guard
    Given the step-writing agent writes the steps of "Add a line" so that they pass at once, with no cart code
    And limits.max_retries is 1
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and "accept_guard", and gives the reason "nothing is invoked when no line is added"
    Then the human was asked once about the scenario "Add a line" passing before any code, with the actions "accept_guard", "retry", "skip_scenario", "skip_fr" and "abort"
    And that question mentions "passes before any code" and shows the step file the step-writing agent wrote
    And the step-writing agent was asked once for "Add a line"
    And the worktree has the commit "oid: checkpoint FR-CART-02 BDD_RED Add a line" with the step definitions and the progress update
    And in the commit "oid: checkpoint FR-CART-02 BDD_RED Add a line" progress.json records "Add a line" as "pass" and "Remove a line" as "pending"
    And in that commit progress.json records "Add a line" as a guard with the reason "nothing is invoked when no line is added"
    And the event log of the run records the guard "Add a line" accepted by the human with the reason "nothing is invoked when no line is added"
    And the run never reaches "TDD_RED" for "Add a line"
    And the step-writing agent was asked for "Remove a line" next

  Scenario: A guard that is the last scenario of the feature lets the feature be done
    Given the feature-writing agent writes for "FR-CART-02" only the scenario "Add a line"
    And the step-writing agent writes the steps of "Add a line" so that they pass at once, with no cart code
    And limits.max_retries is 1
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and "accept_guard", and gives the reason "nothing is invoked when no line is added"
    Then the event log of the run records a transition from "BDD_RED" to "QUALITY_GATE"
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"
    And the run never reaches "TDD_RED"
    And no agent writes a unit test
    And "FR-CART-02" is done in the progress file of the worktree
    And the progress file of the worktree still records "Add a line" as a guard with the reason "nothing is invoked when no line is added"

  Scenario: The human answers retry with a note and the step writer gets the note
    Given the step-writing agent writes the steps of "Add a line" so that they pass at once, with no cart code, and then, when it is told a note, steps that fail because the cart code does not exist yet
    And limits.max_retries is 1
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve" and "retry", and gives the note "assert that the cart has a line"
    Then the human was asked once about the scenario "Add a line" passing before any code, with the actions "accept_guard", "retry", "skip_scenario", "skip_fr" and "abort"
    And the second task of the step-writing agent includes "assert that the cart has a line"
    And no guard is recorded for "Add a line"
    And the event log of the run records a transition from "BDD_RED" to "TDD_RED"
