import { describe, expect, it } from "vitest";
import { reuseCatalogue } from "../../src/agents/context/reuse-catalogue.js";
import { dir, useTempDir, write, writeMinimalConfig } from "./temp-project.js";

useTempDir();

/** Writes a module that exports one function, whose catalogue entry is about 60 characters long. */
function module(path: string, name: string): void {
  write(path, `/** Does ${name}. */\nexport function ${name}(): void {}\n`);
}

describe("reuse catalogue with a budget", () => {
  it("gives the signatures of the modules the task uses first, and lists the modules that do not fit by path only", () => {
    writeMinimalConfig();
    module("src/a.ts", "alpha");
    module("src/b.ts", "bravo");
    module("src/c.ts", "charlie");
    const catalogue = reuseCatalogue(dir, { used: ["src/c.ts"], budget: 90 });
    expect(catalogue.indexOf("charlie")).toBeGreaterThan(-1);
    expect(catalogue).not.toContain("alpha");
    expect(catalogue).not.toContain("bravo");
    expect(catalogue).toContain("Other modules (signatures not shown, read the file when you need it):\n- src/a.ts\n- src/b.ts");
  });
});

describe("reuse catalogue order", () => {
  it("puts the modules next to the ones the task uses before the others, and the modules whose name the task mentions after those", () => {
    writeMinimalConfig();
    module("src/a/first.ts", "alpha");
    module("src/b/second.ts", "bravo");
    module("src/b/third.ts", "charlie");
    module("src/c/cart-lines.ts", "delta");
    module("src/c/other.ts", "echo");
    const catalogue = reuseCatalogue(dir, { used: ["src/b/second.ts"], mentions: "the cart lines are listed", budget: 190 });
    const shown = catalogue.slice(0, catalogue.indexOf("Other modules"));
    expect(["bravo", "charlie", "delta"].every((name) => shown.includes(name))).toBe(true);
    expect(shown).not.toContain("alpha");
    expect(shown).not.toContain("echo");
    expect(shown.indexOf("bravo")).toBeLessThan(shown.indexOf("charlie"));
    expect(shown.indexOf("charlie")).toBeLessThan(shown.indexOf("delta"));
  });
});

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
