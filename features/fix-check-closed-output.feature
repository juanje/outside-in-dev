Feature: Keep the exit code when the reader closes the output early

  @FR-CHECK-04 @process
  Scenario: Closing the check output after the first chunk still fails a check with violations
    Given a SPEC.md with 4000 requirements sharing one ID
    When I run "oid check" and close its output after the first chunk
    Then the command fails
    And the error output does not contain "EPIPE"

  @FR-CHECK-04 @process
  Scenario: Closing the status output after the first chunk still succeeds
    Given 900 tracked features with long titles
    When I run "oid progress status" and close its output after the first chunk
    Then the command succeeds
    And the error output does not contain "EPIPE"
