@FR-INIT-01
Feature: oid init keeps the tests out of the source paths and detects the shared directory

  Scenario: The include entries that point at tests are left out of the source paths and reported
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {}, "include": ["backends/**/*.ts", "shared/**/*.ts", "src/**/*.ts", "tests/**/*.ts"] }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["backends/**/*.ts", "shared/**/*.ts", "src/**/*.ts"]
    And the output contains "left out of paths.source as tests: tests/**/*.ts"

  Scenario: A directory holding the unit tests or the scenarios is a test root
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {}, "include": ["lib/**/*.ts", "checks/**/*.ts", "specs/**/*.ts", "features/**/*.ts"] }
      """
    And a project file "vitest.config.ts" containing:
      """
      export default { test: { include: ["checks/**/*.test.ts"] } };
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["lib/**/*.ts"]
    And the output contains "left out of paths.source as tests: checks/**/*.ts, specs/**/*.ts, features/**/*.ts"

  Scenario: The src directory is never a test root, but test files in it are left out
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {}, "include": ["src/**/*.ts", "src/**/*.test.ts", "lib/**/*.spec.ts"] }
      """
    And a project file "vitest.config.ts" containing:
      """
      export default { test: { include: ["src/**/*.test.ts"] } };
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["src/**/*.ts"]
    And the output contains "left out of paths.source as tests: src/**/*.test.ts, lib/**/*.spec.ts"

  Scenario: Without any entry left the source paths fall back to src
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {}, "include": ["tests/**/*.ts"] }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["src/**"]
    And the output contains "left out of paths.source as tests: tests/**/*.ts"

  Scenario: A tsconfig.json include that is not a list of strings is still reported
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {}, "include": "src" }
      """
    When I run "oid init"
    Then the command fails
    And the error output contains "paths.source"
    And no configuration file exists

  Scenario: A shared directory at the root becomes the shared paths
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file "shared/types.ts" containing:
      """
      export type Id = string;
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.shared" is ["shared/**"]

  Scenario: Without a shared directory the shared paths are empty
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.shared" is []
