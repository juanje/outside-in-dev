@FR-AGENT-07
Feature: Request a dependency

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"

  Scenario Outline: No step lets an agent edit package.json or a lockfile
    Given oid opened an agent session for the step <step>
    When the agent calls "write" on "<file>"
    Then the call is blocked
    When the agent calls "edit" on "<file>"
    Then the call is blocked

    Examples:
      | step          | file              |
      | FEATURE_WRITE | package.json      |
      | BDD_RED       | package.json      |
      | TDD_RED       | package-lock.json |
      | CODE_GREEN    | package.json      |
      | CODE_GREEN    | package-lock.json |
      | CODE_GREEN    | pnpm-lock.yaml    |
      | CODE_GREEN    | yarn.lock         |
      | CODE_GREEN    | bun.lock          |
      | CODE_GREEN    | bun.lockb         |
      | REFACTOR      | package-lock.json |
      | FR_REFACTOR   | package.json      |
      | QUALITY_FIX   | yarn.lock         |

  Scenario Outline: A project that makes a manifest or lockfile writable does not make it writable to an agent
    Given the project's configuration lists "<first>" and "<second>" among its documentation paths
    And oid opened an agent session for the step FR_REFACTOR
    When the agent calls "write" on "<first>"
    Then the call is blocked
    When the agent calls "write" on "<second>"
    Then the call is blocked

    Examples:
      | first          | second            |
      | package.json   | bun.lock          |
      | yarn.lock      | pnpm-lock.yaml    |
      | bun.lockb      | package-lock.json |

  Scenario Outline: A coder step's shell cannot run a package manager
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: <command>
    Then the call is blocked

    Examples:
      | command                         |
      | npm install left-pad            |
      | npm i -D left-pad               |
      | npm add left-pad                |
      | npm uninstall left-pad          |
      | npm remove left-pad             |
      | npm update                      |
      | npm ci                          |
      | pnpm add left-pad               |
      | pnpm install                    |
      | yarn add left-pad               |
      | yarn remove left-pad            |
      | bun add left-pad                |
      | bun install                     |
      | npx npm install left-pad        |
      | npx pnpm add left-pad           |
      | bash -c "npm install left-pad"  |
      | npx vitest run && npm install x |

  Scenario Outline: A coder step's shell cannot write package.json or a lockfile
    Given oid opened an agent session for the step CODE_GREEN
    When the agent runs the shell command: <command>
    Then the call is blocked

    Examples:
      | command                                  |
      | echo {} > package.json                   |
      | echo x >> package-lock.json              |
      | echo x > pnpm-lock.yaml                  |
      | echo x > yarn.lock                       |
      | echo x > bun.lock                        |
      | sed -i s/cart/other/ package.json       |
      | cp src/cart.ts package.json              |
      | mv src/cart.ts yarn.lock                 |
      | rm package-lock.json                     |
      | echo x \| tee package.json               |
      | echo x > src/../package.json             |

  Scenario Outline: An approved request is installed with the project's package manager
    Given the project uses <manager>
    And the human approves dependency requests
    And oid opened an agent session for the step CODE_GREEN
    When the agent requests the <kind> package "<name>" with the version "<version>" because "HTTP client for steps"
    Then the human was asked about "<name>" because "HTTP client for steps"
    And the installer ran "<command>"
    And the agent is told the package was installed

    Examples:
      | manager | kind        | name        | version | command                         |
      | npm     | dev         | undici      | ^7      | npm install -D undici@^7        |
      | npm     | runtime     | lodash      | latest  | npm install lodash@latest       |
      | npm     | runtime     | @types/node | >=20    | npm install @types/node@>=20    |
      | pnpm    | dev         | zod         | ~3.1.0  | pnpm add -D zod@~3.1.0          |
      | pnpm    | runtime     | zod         | ^3      | pnpm add zod@^3                 |
      | yarn    | dev         | zod         | ^3      | yarn add -D zod@^3              |

  Scenario: A request without a version installs the package by its name
    Given the project uses npm
    And the human approves dependency requests
    And oid opened an agent session for the step TDD_RED
    When the agent requests the runtime package "lodash" without a version because "Needed by the cart"
    Then the installer ran "npm install lodash"

  Scenario: A rejected request installs nothing and tells the agent why
    Given the project uses npm
    And the human rejects dependency requests with the note "Use the built-in fetch"
    And oid opened an agent session for the step CODE_GREEN
    When the agent requests the dev package "undici" with the version "^7" because "HTTP client for steps"
    Then nothing was installed
    And the agent is told the request was not approved
    And the agent is told "Use the built-in fetch"

  Scenario: Without anyone to ask nothing is installed
    Given the project uses npm
    And oid opened an agent session for the step CODE_GREEN
    When the agent requests the dev package "undici" with the version "^7" because "HTTP client for steps"
    Then nothing was installed
    And the agent is told the request was not approved

  Scenario Outline: A request that is not a plain package name, version and reason is refused
    Given the project uses npm
    And the human approves dependency requests
    And oid opened an agent session for the step CODE_GREEN
    When the agent requests the dev package "<name>" with the version "<version>" because "<reason>"
    Then the request is refused
    And the human was not asked
    And nothing was installed

    Examples:
      | name                                | version        | reason     |
      | ../evil                             | ^1             | Needed     |
      | left pad                            | ^1             | Needed     |
      | lodash; rm -rf /                    | ^1             | Needed     |
      | -g                                  | ^1             | Needed     |
      | --registry=https://evil.example     | ^1             | Needed     |
      | https://evil.example/pkg.tgz        | ^1             | Needed     |
      | git+ssh://git@evil.example/pkg.git  | ^1             | Needed     |
      | file:../pkg                         | ^1             | Needed     |
      | Lodash                              | ^1             | Needed     |
      | @scope/                             | ^1             | Needed     |
      | lodash                              | ^1; rm -rf /   | Needed     |
      | lodash                              | $(whoami)      | Needed     |
      | lodash                              | 1.0.0 && x     | Needed     |
      | lodash                              | -g             | Needed     |
      | lodash                              | ^1             |            |

  Scenario: A failed installation is reported to the agent
    Given the project uses npm
    And the human approves dependency requests
    And the installer fails with "network unreachable"
    And oid opened an agent session for the step CODE_GREEN
    When the agent requests the dev package "undici" with the version "^7" because "HTTP client for steps"
    Then the agent is told the installation failed
    And the agent is told "network unreachable"

  Scenario: A worktree that shares node_modules with the main copy gets its own before installing
    Given the project uses npm
    And the project's node_modules is shared with the main copy
    And the human approves dependency requests
    And oid opened an agent session for the step CODE_GREEN
    When the agent requests the dev package "undici" with the version "^7" because "HTTP client for steps"
    Then the project's node_modules is no longer a link to the main copy
    And the installer ran "npm ci" and then "npm install -D undici@^7"
    And the main copy's node_modules is untouched

  Scenario Outline: Only the steps that write code or tests can request a dependency
    Given oid opened an agent session for the step <step>
    Then the session offers the request_dependency tool: <offered>

    Examples:
      | step          | offered |
      | FEATURE_WRITE | no      |
      | BDD_RED       | yes     |
      | TDD_RED       | yes     |
      | CODE_GREEN    | yes     |
      | REFACTOR      | yes     |
      | FR_REFACTOR   | yes     |
      | QUALITY_FIX   | yes     |
