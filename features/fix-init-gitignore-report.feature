Feature: oid init reports truthfully what it did to .gitignore

  @FR-INIT-01
  Scenario: A .gitignore that already ignores .outside-in/ is reported as such and left alone
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file ".gitignore" containing:
      """
      dist/
      .outside-in/
      """
    When I run "oid init"
    Then the command succeeds
    And the output contains ".gitignore already ignores .outside-in/"
    And the output does not contain "added .outside-in/"
    And the file ".gitignore" is unchanged

  @FR-INIT-01
  Scenario: An equivalent .gitignore line without the slash is reported as already ignoring
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file ".gitignore" containing:
      """
      .outside-in
      dist/
      """
    When I run "oid init"
    Then the command succeeds
    And the output contains ".gitignore already ignores .outside-in/"
    And the output does not contain "added .outside-in/"
    And the file ".gitignore" is unchanged

  @FR-INIT-01
  Scenario: A .gitignore that lacks the entry is reported as extended
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    And a project file ".gitignore" containing:
      """
      dist/
      """
    When I run "oid init"
    Then the command succeeds
    And the output contains "added .outside-in/ to .gitignore"
    And the output does not contain "already ignores"

  @FR-INIT-01
  Scenario: A missing .gitignore is reported as created with the entry
    Given a project file "tsconfig.json" containing:
      """
      { "compilerOptions": {} }
      """
    When I run "oid init"
    Then the command succeeds
    And the output contains "added .outside-in/ to .gitignore"
    And the output does not contain "already ignores"
