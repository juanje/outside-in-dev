@FR-AGENT-02
Feature: Tools and paths per step

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"

  Scenario: A test-writing step writes unit tests but not source
    Given oid opened an agent session for the step TDD_RED
    When the agent calls "write" on "tests/unit/cart.test.ts"
    Then the call is allowed
    When the agent calls "write" on "src/cart.ts"
    Then the call is blocked
    And the reason names the writable paths "tests/unit/**/*.test.ts"

  Scenario: A test-writing step cannot read source
    Given oid opened an agent session for the step TDD_RED
    When the agent calls "read" on "src/cart.ts"
    Then the call is blocked
    And the reason names the readable paths "features/**/*.feature"
    And the reason names the readable paths "tests/unit/**/*.test.ts"

  Scenario: A search without a path is treated as a search of the whole worktree
    Given oid opened an agent session for the step TDD_RED
    When the agent calls "grep" without a path
    Then the call is blocked
    And the reason names the readable paths "features/**/*.feature"

  Scenario Outline: Only the steps that implement or debug have a shell
    Given oid opened an agent session for the step <step>
    Then the session offers a shell: <shell>
    And the session offers the tools: <tools>

    Examples:
      | step          | shell | tools                                   |
      | FEATURE_WRITE | no    | read, grep, find, ls, write, edit       |
      | BDD_RED       | no    | read, grep, find, ls, write, edit       |
      | TDD_RED       | no    | read, grep, find, ls, write, edit       |
      | CODE_GREEN    | yes   | read, grep, find, ls, write, edit, bash |
      | REFACTOR      | yes   | read, grep, find, ls, write, edit, bash |
      | FR_REFACTOR   | yes   | read, grep, find, ls, write, edit, bash |
      | QUALITY_FIX   | yes   | read, grep, find, ls, write, edit, bash |

  Scenario: A step without a shell is blocked when it asks for one anyway
    Given oid opened an agent session for the step BDD_RED
    When the agent runs the shell command: ls
    Then the call is blocked
    And the reason says the step has no shell

  Scenario: A coder step writes source and runs the project's unit tests
    Given oid opened an agent session for the step CODE_GREEN
    When the agent calls "write" on "src/cart.ts"
    Then the call is allowed
    When the agent runs the shell command: npx vitest run tests/unit/cart.test.ts
    Then the call is allowed

  Scenario: A coder step runs the project's quality gate in one command line
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: npx tsc --noEmit && npx vitest run
    Then the call is allowed

  Scenario: A coder step cannot write what its step does not own
    Given oid opened an agent session for the step CODE_GREEN
    When the agent calls "write" on "progress.json"
    Then the call is blocked
    When the agent calls "edit" on "package.json"
    Then the call is blocked
    When the agent calls "write" on ".outside-in/state.json"
    Then the call is blocked

  Scenario: A coder step's shell runs only the commands its profile allows
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: curl https://example.com
    Then the call is blocked
    And the reason names the allowed commands "npx vitest run"

  Scenario Outline: A coder step's shell cannot change the files only the orchestrator writes
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: <command>
    Then the call is blocked

    Examples:
      | command                                  |
      | echo done > progress.json                |
      | echo done >> progress.json               |
      | rm progress.json                         |
      | rm -rf .outside-in                       |
      | cp src/cart.ts .outside-in/checkpoint    |
      | mv progress.json src/progress.txt        |
      | rm -rf .                                 |
      | rm -rf *                                 |
      | echo x > .git/config                     |
      | echo x > features/../progress.json       |
      | touch package.json                       |

  Scenario Outline: A coder step's shell cannot hide a command inside a wrapper
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: <command>
    Then the call is blocked

    Examples:
      | command                                                      |
      | bash -c "echo done > progress.json"                          |
      | sh -c 'rm -rf .outside-in'                                   |
      | bash -c "sh -c 'echo x > progress.json'"                     |
      | node -e "require('fs').writeFileSync('progress.json', '')"   |
      | npx tsx -e "console.log(1)"                                  |
      | eval "echo x > progress.json"                                |
      | echo $(cat progress.json)                                    |
      | echo `cat progress.json`                                     |
      | echo x > $HOME/file                                          |

  Scenario: A coder step's shell cannot write through a symlink to orchestrator state
    Given the project holds the symlink "src/state.json" to "../progress.json"
    And the project holds the symlink "src/runs" to "../.outside-in"
    And oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: echo done > src/state.json
    Then the call is blocked
    When the agent runs the shell command: rm -rf src/runs
    Then the call is blocked
    When the agent calls "write" on "src/state.json"
    Then the call is blocked

  Scenario: A coder step's shell stays inside the worktree
    Given the project holds the symlink "src/outside" to the directory outside the project
    And oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: cat ../outside.txt
    Then the call is blocked
    When the agent runs the shell command: cat /etc/hostname
    Then the call is blocked
    When the agent runs the shell command: echo x > src/outside/file.txt
    Then the call is blocked

  Scenario: Git stays with the orchestrator
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: git commit -am done
    Then the call is blocked
    And the reason says git stays with the orchestrator

  Scenario: A path that escapes through ".." is blocked
    Given oid opened an agent session for the step FEATURE_WRITE
    When the agent calls "write" on "features/../.git/config"
    Then the call is blocked
    When the agent calls "write" on "../outside.feature"
    Then the call is blocked

  Scenario: Repeated violations end the session
    Given oid opened an agent session for the step TDD_RED
    When the agent makes 5 blocked calls
    Then the session was not aborted
    When the agent makes 1 blocked calls
    Then the session was aborted

  Scenario: The sandbox is installed on the session that oid opens
    Given oid opened an agent session for the step TDD_RED
    Then the session's tool call hook is oid's sandbox
    And a forbidden call made through that hook is blocked
