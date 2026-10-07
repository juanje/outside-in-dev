@FR-AGENT-03
Feature: Secrets are never readable

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"
    And the project holds the secret files ".env", ".env.production", "config/server.pem", "deploy/tls.key", "secrets/token.txt" and "auth.json"

  Scenario Outline: A secret file cannot be read in any step, the coder's whole-repository read included
    Given oid opened an agent session for the step <step>
    When the agent calls "read" on "<file>"
    Then the call is blocked
    And the reason says the file is a secret

    Examples:
      | step        | file               |
      | TDD_RED     | .env               |
      | CODE_GREEN  | .env               |
      | CODE_GREEN  | .env.production    |
      | CODE_GREEN  | config/server.pem  |
      | CODE_GREEN  | deploy/tls.key     |
      | CODE_GREEN  | secrets/token.txt  |
      | QUALITY_FIX | auth.json          |

  Scenario Outline: Searching, finding or listing a secret is blocked too
    Given oid opened an agent session for the step CODE_GREEN
    When the agent calls "<tool>" on "<path>"
    Then the call is blocked
    And the reason says the file is a secret

    Examples:
      | tool | path              |
      | grep | .env              |
      | find | secrets           |
      | ls   | secrets           |
      | edit | config/server.pem |

  Scenario: A symbolic link to a secret is a secret
    Given the project holds the symlink "notes.txt" to ".env"
    And the user's home holds the SSH key "~/.ssh/id_rsa"
    And the project holds the symlink "key.txt" to the user's SSH key
    And oid opened an agent session for the step CODE_GREEN
    When the agent calls "read" on "notes.txt"
    Then the call is blocked
    And the reason says the file is a secret
    When the agent calls "read" on "key.txt"
    Then the call is blocked
    And the reason says the file is a secret

  Scenario Outline: The user's SSH, AWS and GnuPG directories are secrets
    Given the user's home holds the files ".ssh/id_rsa", ".aws/credentials" and ".gnupg/pubring.kbx"
    And oid opened an agent session for the step CODE_GREEN
    When the agent calls "<tool>" on "<path>"
    Then the call is blocked
    And the reason says the file is a secret

    Examples:
      | tool | path                  |
      | read | ~/.ssh/id_rsa         |
      | read | ~/.aws/credentials    |
      | read | ~/.gnupg/pubring.kbx  |
      | ls   | ~/.ssh                |
      | grep | ~/.aws                |

  Scenario: A project cannot make a secret readable
    Given the project's configuration lists ".env" and "secrets/**" among its documentation paths
    And oid opened an agent session for the step QUALITY_FIX
    When the agent calls "read" on ".env"
    Then the call is blocked
    And the reason says the file is a secret
    When the agent calls "edit" on "secrets/token.txt"
    Then the call is blocked
    And the reason says the file is a secret

  Scenario: Blocked reads of secrets count as denials
    Given oid opened an agent session for the step CODE_GREEN
    When the agent calls "read" on ".env" 6 times
    Then the session was aborted

  Scenario: A search of the whole project never returns the lines of a secret
    Given oid opened an agent session for the step CODE_GREEN
    When the agent calls "grep" without a path and Pi returns
      """
      .env:1: API_KEY=hunter2
      deploy/tls.key-3- hunter2-context
      secrets/token.txt:2: hunter2
      src/cart.ts:1: export const cart = 1; // hunter2
      """
    Then the call is allowed
    And the result the agent sees is
      """
      src/cart.ts:1: export const cart = 1; // hunter2
      """

  Scenario: A search of the whole project never lists a secret file
    Given oid opened an agent session for the step CODE_GREEN
    When the agent calls "find" without a path and Pi returns
      """
      .env
      config/server.pem
      src/cart.ts
      tests/unit/cart.test.ts
      """
    Then the call is allowed
    And the result the agent sees is
      """
      src/cart.ts
      tests/unit/cart.test.ts
      """

  Scenario: A directory listing never shows a secret file
    Given the project holds the symlink "notes.txt" to ".env"
    And oid opened an agent session for the step CODE_GREEN
    When the agent calls "ls" without a path and Pi returns
      """
      .env
      notes.txt
      secrets/
      src/
      """
    Then the call is allowed
    And the result the agent sees is
      """
      src/
      """

  Scenario Outline: The shell cannot read a secret
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: <command>
    Then the call is blocked
    And the reason says the file is a secret

    Examples:
      | command                          |
      | cat .env                         |
      | cat ./config/../.env             |
      | grep KEY .env.production         |
      | grep --file=.env src/cart.ts     |
      | bash -c 'cat .env'               |
      | head -n 1 < .env                 |
      | cp .env src/copy.txt             |
      | cat secrets/token.txt            |
      | ls ~/.ssh                        |

  Scenario Outline: The shell cannot reach a secret through a directory or a wildcard
    Given the project holds the symlink "notes.txt" to ".env"
    And oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: <command>
    Then the call is blocked
    And the reason says the file is a secret

    Examples:
      | command                  |
      | cat notes.txt            |
      | grep -r KEY .            |
      | grep -rn KEY config      |
      | cat .*                   |
      | cat secrets/*            |
      | cp -r . src/backup       |

  Scenario: The shell still reads and searches files that are not secrets
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: grep -r cart src
    Then the call is allowed
    When the agent runs the shell command: cat src/cart.ts
    Then the call is allowed
