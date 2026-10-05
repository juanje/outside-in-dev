@FR-INIT-01
Feature: oid init reads tsconfig.json the way TypeScript does, with comments and trailing commas

  Scenario: A tsconfig.json with line and block comments is read
    Given a project file "tsconfig.json" containing:
      """
      {
        // the compiler options
        "compilerOptions": {}, /* no options needed */
        "include": ["lib/**/*.ts"]
      }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["lib/**/*.ts"]

  Scenario: A tsconfig.json with trailing commas is read
    Given a project file "tsconfig.json" containing:
      """
      {
        "compilerOptions": {},
        "include": ["lib/**/*.ts", "app/**/*.ts",],
      }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["lib/**/*.ts", "app/**/*.ts"]

  Scenario: A comment-like text inside a string of tsconfig.json is kept
    Given a project file "tsconfig.json" containing:
      """
      {
        // a real comment
        "include": ["lib//x/**/*.ts"]
      }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["lib//x/**/*.ts"]
