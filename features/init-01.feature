@FR-INIT-01
Feature: Detect the project setup

  Scenario: A TypeScript project with no special configuration gets the defaults
    Given a project file "package.json" containing:
      """
      { "name": "demo", "devDependencies": { "typescript": "5.0.0" } }
      """
    And a project file "tsconfig.json" containing:
      """
      { "compilerOptions": { "strict": true } }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "version" is 1
    And the configuration field "stack" is "typescript"
    And the configuration field "paths.source" is ["src/**"]
    And the configuration field "paths.shared" is []
    And the configuration field "paths.unit_tests" is ["tests/unit/**"]
    And the configuration field "paths.bdd_features" is ["features/**/*.feature"]
    And the configuration field "paths.bdd_steps" is ["features/steps/**", "features/support/**"]
    And the configuration field "paths.docs" is ["README.md", "docs/**"]
    And the configuration field "paths.spec" is "SPEC.md"
    And the configuration field "paths.design" is ["SPEC.md", "DOMAIN.md", "DECISIONS.md"]
    And the configuration field "paths.progress" is "progress.json"

  Scenario: The configuration file is two-space JSON with a trailing newline
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration file starts with:
      """
      {
        "version": 1,
        "stack": "typescript",
      """
    And the configuration file ends with a single newline

  Scenario: The output says what was detected and written
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    When I run "oid init"
    Then the output contains "typescript"
    And the output contains "src/**"
    And the output contains ".outside-in.json"
    And the output contains ".gitignore"

  Scenario: A project is recognised as TypeScript by its dependencies alone
    Given a project file "package.json" containing:
      """
      { "name": "demo", "dependencies": { "typescript": "5.0.0" } }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "stack" is "typescript"

  Scenario: A project that is not TypeScript is refused
    Given a project file "package.json" containing:
      """
      { "name": "demo", "dependencies": { "left-pad": "1.3.0" } }
      """
    When I run "oid init"
    Then the command fails
    And the error output contains "only TypeScript projects are supported"
    And no configuration file exists
    And no ".gitignore" file exists

  Scenario: Source paths come from the include entries of tsconfig.json
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {}, "include": ["lib/**/*.ts", "app/**/*.ts"] }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.source" is ["lib/**/*.ts", "app/**/*.ts"]

  Scenario: A tsconfig.json that is not plain JSON is reported
    Given a project file "tsconfig.json" containing:
      """
      {
        // a comment makes this JSONC
        "compilerOptions": {}
      }
      """
    When I run "oid init"
    Then the command fails
    And the error output contains "tsconfig.json"
    And no configuration file exists
    And no ".gitignore" file exists

  Scenario: Unit test paths come from the vitest configuration
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file "vitest.config.ts" containing:
      """
      import { defineConfig } from "vitest/config";

      export default defineConfig({
        test: {
          include: ["spec/**/*.spec.ts", 'more/**/*.test.ts'],
          passWithNoTests: true,
        },
      });
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.unit_tests" is ["spec/**/*.spec.ts", "more/**/*.test.ts"]

  Scenario: Feature and step paths come from the cucumber configuration
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file "cucumber.mjs" containing:
      """
      export default {
        paths: ["specs/**/*.feature"],
        import: ["specs/steps/**/*.ts", "specs/support/**/*.ts"],
      };
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "paths.bdd_features" is ["specs/**/*.feature"]
    And the configuration field "paths.bdd_steps" is ["specs/steps/**/*.ts", "specs/support/**/*.ts"]

  Scenario: Commands come from the scripts of package.json
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file "package.json" containing:
      """
      {
        "name": "demo",
        "scripts": {
          "build": "tsc",
          "check-types": "tsc --noEmit",
          "unit": "vitest run",
          "features": "cucumber-js --tags \"not @wip\"",
          "pretty": "prettier --check .",
          "lint": "eslint src"
        }
      }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "commands.typecheck" is "npm run check-types"
    And the configuration field "commands.unit" is "npm run unit"
    And the configuration field "commands.bdd" is "npm run features"
    And the configuration field "commands.format" is "npm run pretty"
    And the configuration field "commands.lint" is "npm run lint"
    And the configuration field "commands.coverage" is null
    And the configuration field "commands.extra_checks" is []

  Scenario: Biome scripts are recognised as formatter and linter
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file "package.json" containing:
      """
      { "name": "demo", "scripts": { "fmt": "biome format .", "check": "biome check ." } }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "commands.format" is "npm run fmt"
    And the configuration field "commands.lint" is "npm run check"

  Scenario: A script that only chains other scripts is not chosen over the one that runs the tool
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file "package.json" containing:
      """
      {
        "name": "demo",
        "scripts": {
          "test": "npm run test:unit && npm run test:bdd",
          "test:unit": "vitest run",
          "test:bdd": "cucumber-js"
        }
      }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "commands.unit" is "npm run test:unit"
    And the configuration field "commands.bdd" is "npm run test:bdd"

  Scenario: Commands fall back to the standard invocations when no script matches
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file "package.json" containing:
      """
      { "name": "demo", "scripts": { "build": "tsc" } }
      """
    When I run "oid init"
    Then the command succeeds
    And the configuration field "commands.unit" is "npx vitest run"
    And the configuration field "commands.bdd" is "NODE_OPTIONS=\"--import tsx\" npx cucumber-js"
    And the configuration field "commands.typecheck" is "npx tsc --noEmit"
    And the configuration field "commands.format" is null
    And the configuration field "commands.lint" is null

  Scenario: The .outside-in/ directory is added to a new .gitignore
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    When I run "oid init"
    Then the command succeeds
    And the file ".gitignore" has exactly the lines:
      | .outside-in/ |

  Scenario: The .outside-in/ directory is appended to an existing .gitignore
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file ".gitignore" containing:
      """
      node_modules/
      dist/
      """
    When I run "oid init"
    Then the command succeeds
    And the file ".gitignore" has exactly the lines:
      | node_modules/ |
      | dist/         |
      | .outside-in/  |

  Scenario Outline: An equivalent .gitignore line is not duplicated
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file ".gitignore" containing:
      """
      node_modules/
      <line>
      """
    When I run "oid init"
    Then the command succeeds
    And the file ".gitignore" has exactly the lines:
      | node_modules/ |
      | <line>        |

    Examples:
      | line         |
      | .outside-in/ |
      | .outside-in  |

  Scenario: An existing configuration file is refused and nothing is changed
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file ".outside-in.json" containing:
      """
      { "version": 1, "hand": "edited" }
      """
    When I run "oid init"
    Then the command fails
    And the error output contains ".outside-in.json already exists"
    And the file ".outside-in.json" is unchanged
    And no ".gitignore" file exists
