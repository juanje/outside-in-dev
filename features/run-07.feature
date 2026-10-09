@FR-RUN-07
Feature: Commit the feature

  Background:
    Given a git project with a green suite
    And the project runs its BDD scenarios with cucumber and defines the steps of the scenario "Add to cart"
    And SPEC.md has the requirements "FR-CART-01" and "FR-CART-02"
    And progress.json records "FR-CART-01" as done with its passing scenario "Add to cart", and "FR-CART-02" as pending
    And the feature-writing agent writes for "FR-CART-02" the scenarios "Add a line" and "Remove a line"
    And the step-writing agent writes the steps of each scenario it is given, and they fail because the cart code does not exist yet
    And the agents write for each of the two scenarios a failing unit test and the cart code that passes it and the scenario
    And the detectors find nothing

  Scenario: A finished feature becomes one commit named after its requirement, with its scenarios listed
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then the run's branch has one commit since the start of the run, named "feat(cart): FR-CART-02 Feature FR-CART-02"
    And that commit holds the feature file, the step definitions, the unit test, the cart code and progress.json
    And the body of that commit lists the scenarios "Add a line" and "Remove a line", one per line
    And the run's branch no longer holds the commit "oid: checkpoint FR-CART-02 QUALITY_GATE"

  Scenario: The commit of the feature records it as done, and the run ends when no target feature is left
    When I run "oid run --fr FR-CART-02" with a terminal where the human answers "approve"
    Then in the commit "feat(cart): FR-CART-02 Feature FR-CART-02" progress.json records "FR-CART-02" as done, with "Add a line" as "pass" and "Remove a line" as "pass"
    And "FR-CART-02" is done in the progress file of the worktree
    And "FR-CART-01" is still done
    And the event log of the run records a transition from "QUALITY_GATE" to "FR_COMMIT"
    And the event log of the run records a transition from "FR_COMMIT" to "DONE"
    And the project has no lock

  Scenario: With several target features, each becomes its own commit, in order, with only its own feature file
    Given SPEC.md has the requirements "FR-CART-01", "FR-CART-02" and "FR-CART-03"
    And progress.json tracks "FR-CART-03" as pending
    And the feature-writing agent writes for "FR-CART-03" the scenario "Clear the cart"
    And the step-writing agent also writes the steps of "Clear the cart", and they fail because the cart code does not exist yet
    And the agents also write for "Clear the cart" a failing unit test and the cart code that passes it and the scenario
    When I run "oid run --fr FR-CART-02 FR-CART-03" with a terminal where the human answers "approve"
    Then the run's branch has the commits "feat(cart): FR-CART-02 Feature FR-CART-02" and "feat(cart): FR-CART-03 Feature FR-CART-03", in that order
    And the event log of the run records a transition from "FR_COMMIT" to "BDD_RED" whose reason mentions "FR-CART-03"
    And the commit "feat(cart): FR-CART-02 Feature FR-CART-02" does not hold the feature file of "FR-CART-03"
    And the commit "feat(cart): FR-CART-03 Feature FR-CART-03" holds the feature file of "FR-CART-03"
