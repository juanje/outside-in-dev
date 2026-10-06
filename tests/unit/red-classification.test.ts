import { describe, expect, it } from "vitest";
import { classifyFailure, type ClassifyContext } from "../../src/artifacts/red-classification.js";

const context: ClassifyContext = { cwd: "/p", isSource: (path) => path.startsWith("src/"), resolveSymbol: () => "missing" };

describe("classifyFailure", () => {
  it("rejects a test that passes: it verifies nothing new", () => {
    expect(classifyFailure({ kind: "passed" }, context)).toEqual({ outcome: "invalid", class: "test_bug", reason: "the test passes without new implementation" });
  });

  it("rejects a test file that does not compile: a syntax error is a broken test", () => {
    const message = 'Transform failed with 1 error:\n/p/tests/unit/a.test.ts:2:24: ERROR: Expected identifier but found "="';
    expect(classifyFailure({ kind: "load", message }, context)).toEqual({
      outcome: "invalid",
      class: "test_bug",
      reason: 'the test file does not compile: Transform failed with 1 error: /p/tests/unit/a.test.ts:2:24: ERROR: Expected identifier but found "="',
    });
  });

  it("accepts a test of a source module that does not exist yet as missing implementation", () => {
    const message = "Cannot find module '../../src/nope.js' imported from '/p/tests/unit/a.test.ts'";
    expect(classifyFailure({ kind: "load", message }, context)).toEqual({
      outcome: "valid",
      class: "missing_implementation",
      reason: "the module ../../src/nope.js does not exist yet",
    });
  });

  it("treats a package that cannot be found as the environment, not a Red", () => {
    const message = "Cannot find package 'left-padz' imported from '/p/tests/unit/a.test.ts'";
    expect(classifyFailure({ kind: "load", message }, context)).toEqual({
      outcome: "invalid",
      class: "environment",
      reason: "left-padz cannot be found and is not a source module of the project",
    });
  });

  it("never takes a package name for a source module, even when the test sits among the source files", () => {
    const message = "Cannot find package 'left-padz' imported from '/p/src/a.test.ts'";
    expect(classifyFailure({ kind: "load", message }, { ...context, isSource: () => true })).toMatchObject({ outcome: "invalid", class: "environment" });
  });

  it("leaves a file that fails to load for another reason to a decision", () => {
    expect(classifyFailure({ kind: "load", message: "Error: setup exploded" }, context)).toEqual({
      outcome: "decision",
      reason: "the test file failed to load",
    });
  });

  it("accepts a call of an imported function that does not exist yet as missing implementation", () => {
    const message = "TypeError: (0 , shout) is not a function\n    at /p/tests/unit/a.test.ts:3:60";
    expect(classifyFailure({ kind: "error", message }, context)).toEqual({
      outcome: "valid",
      class: "missing_implementation",
      reason: "shout does not exist yet",
    });
  });

  it("leaves a call of something that exists but is not a function to a decision", () => {
    const message = "TypeError: (0 , greeting) is not a function\n    at /p/tests/unit/a.test.ts:3:60";
    expect(classifyFailure({ kind: "error", message }, { ...context, resolveSymbol: () => "exists" })).toEqual({
      outcome: "decision",
      reason: "greeting exists in the project: the test may use it wrongly",
    });
  });

  it("leaves any other runtime error to a decision, with no candidate class", () => {
    expect(classifyFailure({ kind: "error", message: "RangeError: Invalid count value: -1\n    at x" }, context)).toEqual({
      outcome: "decision",
      reason: "the test failed with an error that is not an assertion",
    });
  });

  it("leaves a failing assertion to a decision, as a candidate business assertion", () => {
    expect(classifyFailure({ kind: "error", message: "AssertionError: expected 3 to be 4 // Object.is equality\n    at x" }, context)).toEqual({
      outcome: "decision",
      reason: "an assertion failed",
      candidate: "business_assertion",
    });
  });

  it("accepts the construction of an imported class that does not exist yet as missing implementation", () => {
    expect(classifyFailure({ kind: "error", message: "TypeError: Missing is not a constructor\n    at x" }, context)).toEqual({
      outcome: "valid",
      class: "missing_implementation",
      reason: "Missing does not exist yet",
    });
  });

  it("leaves a call of a name that does not come from a project module to a decision", () => {
    const message = "TypeError: (0 , padLeft) is not a function\n    at x";
    expect(classifyFailure({ kind: "error", message }, { ...context, resolveSymbol: () => "external" })).toEqual({
      outcome: "decision",
      reason: "padLeft is not imported from a project module",
    });
  });
});
