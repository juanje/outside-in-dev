import { describe, expect, it } from "vitest";
import { reuseCatalogue } from "../../src/agents/context/reuse-catalogue.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

describe("reuse catalogue", () => {
  it("lists an exported function with its signature and the first line of its JSDoc, without its body or private symbols", () => {
    writeMinimalConfig();
    write(
      "src/cart.ts",
      ["/** Adds an item to the cart.", " * More detail on a second line. */", "export function addItem(cart: string[], item: string): string[] {", "  return [...cart, item]; // BODY-MARK", "}", "", "function hidden(): void {}", ""].join("\n"),
    );
    const catalogue = reuseCatalogue(dir);
    expect(catalogue).toContain("## src/cart.ts");
    const entry = catalogue.split("\n").find((line) => line.includes("addItem"));
    expect(entry).toContain("addItem(cart: string[], item: string): string[]");
    expect(entry).toContain("Adds an item to the cart.");
    expect(catalogue).not.toContain("More detail");
    expect(catalogue).not.toContain("BODY-MARK");
    expect(catalogue).not.toContain("hidden");
  });

  it("lists constants, arrow functions, classes and types of each module under its own heading", () => {
    writeMinimalConfig();
    write("src/tax.ts", ["/** The sales tax rate. */", "export const TAX_RATE = 0.21;", "", "/** Prices with tax. */", "export const withTax = (amount: number): number => amount * TAX_RATE; // BODY-ARROW", ""].join("\n"));
    write("src/model.ts", ["/** A shopper. */", "export class Shopper {", "  name = 'x'; // BODY-CLASS", "}", "", "/** A line of an order. */", "export interface Line { sku: string }", "", "/** An order id. */", "export type OrderId = string;", ""].join("\n"));
    const catalogue = reuseCatalogue(dir);
    expect(catalogue).toContain("## src/tax.ts");
    expect(catalogue).toContain("## src/model.ts");
    expect(catalogue.split("\n").find((line) => line.includes("TAX_RATE"))).toMatch(/const TAX_RATE.*The sales tax rate\./);
    expect(catalogue.split("\n").find((line) => line.includes("withTax"))).toContain("withTax = (amount: number): number =>");
    expect(catalogue.split("\n").find((line) => line.includes("Shopper"))).toMatch(/class Shopper.*A shopper\./);
    expect(catalogue.split("\n").find((line) => line.includes("Line"))).toMatch(/interface Line.*A line of an order\./);
    expect(catalogue.split("\n").find((line) => line.includes("OrderId"))).toMatch(/type OrderId = string.*An order id\./);
    expect(catalogue).not.toContain("BODY-ARROW");
    expect(catalogue).not.toContain("BODY-CLASS");
  });
});
