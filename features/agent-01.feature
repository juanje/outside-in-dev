@FR-AGENT-01
Feature: Isolated agent sessions

  Background:
    Given a user whose personal Pi directory holds settings, a skill and a context file
    And a project with its own context file "AGENTS.md"

  Scenario: An agent session ignores the user's personal Pi settings
    When oid opens an agent session for a task
    Then the session's default provider, model and thinking level are not the user's

  Scenario: An agent session sees none of the user's skills or context files
    When oid opens an agent session for a task
    Then the session's system prompt is exactly oid's own prompt followed by the working directory
    And the system prompt does not mention the personal skill, the personal context file or the project's context file

  Scenario: Without a configured agent directory, oid uses its own directory under the user's home
    Given oid's own agent directory ".config/oid/agent" under the user's home holds the thinking level "minimal"
    When oid opens an agent session for a task
    Then the session's default thinking level is "minimal"

  Scenario: The environment variable moves oid's agent directory
    Given oid's agent directory is set to a custom directory holding the thinking level "low"
    And oid's own agent directory ".config/oid/agent" under the user's home holds the thinking level "minimal"
    When oid opens an agent session for a task
    Then the session's default thinking level is "low"

  Scenario: Every task gets a new session with its own transcript
    Given oid opened an agent session for a task and its transcript received the message "first task secret"
    When oid opens an agent session for another task
    Then the second session has a different transcript file from the first
    And the second session's transcript does not contain "first task secret"

  Scenario: The transcript goes into the run's sessions directory, created when missing
    Given the run's sessions directory does not exist yet
    When oid opens an agent session for a task
    Then the run's sessions directory exists
    And the session's transcript file is inside it
