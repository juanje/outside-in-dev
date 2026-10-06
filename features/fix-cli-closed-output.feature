Feature: Exit quietly when the reader closes the output early

  @FR-PROG-01 @process
  Scenario: Closing the status output after the first chunk leaves no error output
    Given 900 tracked features with long titles
    When I run "oid progress status" and close its output after the first chunk
    Then the error output does not contain "EPIPE"
    And the error output does not contain "    at "
