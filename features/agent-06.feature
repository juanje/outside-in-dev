@FR-AGENT-06
Feature: Hints after a failed edit

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"
    And oid opened an agent session for the step CODE_GREEN

  Scenario: An anchor that does not match gets a hint to copy it exactly
    When the agent edits "src/cart.ts" replacing "export const missing = 2;" with "export const cart = 2;"
    Then the edit fails
    And the error the agent sees says "Could not find"
    And the error the agent sees says "copy the anchor exactly, with spaces and line breaks"
    And the error the agent sees says "read the file again first"

  Scenario: An anchor that is not unique gets a hint to add surrounding lines
    Given the file "src/dup.ts" holds the text "const a = 1;\nconst a = 1;\n"
    When the agent edits "src/dup.ts" replacing "const a = 1;" with "const a = 2;"
    Then the edit fails
    And the error the agent sees says "occurrences"
    And the error the agent sees says "add more surrounding lines to make it unique"

  Scenario: A replacement that changes nothing gets a hint that it is identical
    When the agent edits "src/cart.ts" replacing "export const cart = 1;" with "export const cart = 1;"
    Then the edit fails
    And the error the agent sees says "No changes made"
    And the error the agent sees says "the replacement is identical to the original"

  Scenario: A successful edit gets no hint
    When the agent edits "src/cart.ts" replacing "export const cart = 1;" with "export const cart = 2;"
    Then the edit succeeds
    And the result the agent sees has no hint
