@FR-AGENT-05
Feature: Detect provider failures

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"

  Scenario: A rejected API key stops the run and asks, without a retry
    Given the provider answers every request with the error '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'
    When oid runs the agent for the step CODE_GREEN
    Then the attempt stops and asks
    And the question says "invalid x-api-key"
    And oid opened 1 agent session

  Scenario: An exhausted quota stops the run and asks, without a retry
    Given the provider answers every request with the error "429 You exceeded your current quota, please check your plan and billing details"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt stops and asks
    And the question says "exceeded your current quota"
    And oid opened 1 agent session

  Scenario: A rate limit is retried in a new session and the retry succeeds
    Given the agent changes "src/cart.ts"
    And the agent ends by reporting done with the files "src/cart.ts"
    And the provider fails the first request with the error "429 rate limit exceeded"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt succeeds
    And oid opened 2 agent sessions
    And oid waited 5 seconds before the first retry

  Scenario: A server error is retried in a new session and the retry succeeds
    Given the agent changes "src/cart.ts"
    And the agent ends by reporting done with the files "src/cart.ts"
    And the provider fails the first request with the error "529 overloaded_error: Overloaded"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt succeeds
    And oid opened 2 agent sessions

  Scenario: A provider that keeps failing with a transient error stops and asks after three retries
    Given the provider answers every request with the error "503 Service Unavailable"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt stops and asks
    And the question says "503 Service Unavailable"
    And oid opened 4 agent sessions
    And oid waited 5, 20 and 60 seconds between the tries

  Scenario: A response with nothing in it fails the attempt
    Given the provider answers with nothing
    When oid runs the agent for the step CODE_GREEN
    Then the attempt fails
    And the failure says the agent produced nothing

  Scenario: An aborted turn fails the attempt
    Given the turn is aborted
    When oid runs the agent for the step CODE_GREEN
    Then the attempt fails
    And the failure says the turn was aborted

  Scenario: A provider error is never success, even when the agent had reported done
    Given the agent changes "src/cart.ts"
    And the agent ends by reporting done with the files "src/cart.ts"
    And the provider answers every request with the error "401 invalid x-api-key"
    When oid runs the agent for the step CODE_GREEN
    Then the attempt stops and asks
