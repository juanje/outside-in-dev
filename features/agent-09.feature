@FR-AGENT-09
Feature: A test task receives public signatures

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

  Scenario: A test task lists the name, the types and the first documentation line of the exported symbols
    When oid builds the test task from the scenario "features/checkout.feature:2" and the failure "expected the order to be paid"
    Then the task lists the module "src/pricing.ts" in its catalogue with the symbol "price(cart: number[]): number" and the description "Prices a cart with its tax."
    And the task lists the module "src/checkout.ts" in its catalogue with the symbol "checkout(cart: number[]): number" and the description "Charges the cart by card."
    And the task does not say "BODY-CHECKOUT"
    And the task does not say "BODY-PRICING"
    And the task does not say "BODY-SLUG"
    And the task does not say "Second line of the comment"

  Scenario: A test task receives the signatures of every module, imported or not
    When oid builds the test task from the scenario "features/checkout.feature:2" and the failure "expected the order to be paid"
    Then the task lists the module "src/unrelated.ts" in its catalogue with the symbol "slugify(title: string): string" and the description "Turns a title into a URL slug."
