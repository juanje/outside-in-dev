@FR-AGENT-08
Feature: Context per task

  Background:
    Given a git project with source, unit tests, features, "progress.json" and ".outside-in/"
    And the file "features/checkout.feature" holds:
      """
      Feature: Checkout
        Scenario: Pay by card
          When the customer pays by card
          Then the order is paid

        Scenario: Pay by voucher
          When the customer pays by voucher
          Then the voucher is spent
      """
    And the file "tests/unit/checkout.test.ts" holds:
      """
      import { expect, it } from "vitest";
      import { checkout } from "../../src/checkout.js";

      it("charges the cart", () => {
        expect(checkout([5])).toBe(5);
      });
      """
    And the file "src/checkout.ts" holds:
      """
      import { price } from "./pricing.js";

      /** Charges the cart by card. */
      export function checkout(cart: number[]): number {
        return price(cart); // BODY-CHECKOUT
      }
      """
    And the file "src/pricing.ts" holds:
      """
      import { TAX_RATE } from "./tax.js";

      /** Prices a cart with its tax. */
      export function price(cart: number[]): number {
        return cart.length * TAX_RATE; // BODY-PRICING
      }
      """
    And the file "src/tax.ts" holds:
      """
      /** The sales tax rate. */
      export const TAX_RATE = 0.21;
      """
    And the file "src/unrelated.ts" holds:
      """
      /** Turns a title into a URL slug.
       * Second line of the comment. */
      export function slugify(title: string): string {
        return title.toLowerCase(); // BODY-SLUG
      }
      """

  Scenario: A test task gets the scenario and the failure, and nothing of the source or of other scenarios
    When oid builds the test task from the scenario "features/checkout.feature:2" and the failure "expected the order to be paid"
    Then the task says "features/checkout.feature:2"
    And the task says "Scenario: Pay by card"
    And the task says "When the customer pays by card"
    And the task says "Then the order is paid"
    And the task says "expected the order to be paid"
    And the task does not say "Pay by voucher"
    And the task does not say "BODY-CHECKOUT"
    And the task does not say "BODY-PRICING"

  Scenario: An implementation task gets the failing test, the failure, the code it imports and the catalogue
    When oid builds the implementation task from the test "tests/unit/checkout.test.ts" and the failure "checkout is not a function"
    Then the task says "expect(checkout([5])).toBe(5);"
    And the task says "checkout is not a function"
    And the task says "BODY-CHECKOUT"
    And the task says "BODY-PRICING"
    And the task says "export const TAX_RATE = 0.21;"
    And the task lists the module "src/pricing.ts" in its catalogue with the symbol "price(cart: number[]): number" and the description "Prices a cart with its tax."
    And the task does not say "Pay by voucher"

  Scenario: A source file the test does not import is in the catalogue but its body is not in the task
    When oid builds the implementation task from the test "tests/unit/checkout.test.ts" and the failure "checkout is not a function"
    Then the task lists the module "src/unrelated.ts" in its catalogue with the symbol "slugify(title: string): string" and the description "Turns a title into a URL slug."
    And the task does not say "BODY-SLUG"
    And the task does not say "Second line of the comment"

  Scenario: The coder is told to search the catalogue before writing new code
    Given oid opened an agent session for the step CODE_GREEN
    Then the system prompt says "search the reuse catalogue in your task before you write a new function or constant, and reuse what exists"
