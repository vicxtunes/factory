import assert from "node:assert/strict";
import { test } from "node:test";

import { isSheetCategory, sheetCostFor, sheetPriceFor, type SheetMaterialRow, type SheetPriceRow } from "./model";

const prices: SheetPriceRow[] = [
  { component: "PVC", size: "12x12", choice: null, price: 5000 },
  { component: "PVC", size: null, choice: null, price: 3000 },
  { component: "Paper & Ink", size: null, choice: null, price: 5000 },
  { component: "Lamination", size: null, choice: "Matt", price: 2000 },
  { component: "Lamination", size: "6x6", choice: "Matt", price: 500 },
];

test("a sheet's price is its components added up", () => {
  const sheet = sheetPriceFor(prices, "12x12", "Matt");
  assert.equal(sheet.price, 12000);
  assert.deepEqual(sheet.missing, []);
  assert.deepEqual(sheet.lines.map((l) => l.component), ["PVC", "Paper & Ink", "Lamination"]);
});

test("a size's own price beats the every-size one, which fills in for the rest", () => {
  assert.equal(sheetPriceFor(prices, "10x10", "Matt").price, 10000);
  assert.equal(sheetPriceFor(prices, "6x6", "Matt").price, 8500);
});

test("a component with no price for this choice is named, not priced at nothing", () => {
  assert.deepEqual(sheetPriceFor(prices, "12x12", "Glossy").missing, ["Lamination"]);
});

test("case and spaces don't matter", () => {
  assert.equal(sheetPriceFor(prices, " 12X12 ", "matt").price, 12000);
});

const uses: SheetMaterialRow[] = [
  { materialId: "pvc12", size: "12x12", choice: null, qty: 1 },
  { materialId: "paper", size: null, choice: null, qty: 1 },
  { materialId: "ink", size: null, choice: null, qty: 0.25 },
  { materialId: "matt", size: null, choice: "Matt", qty: 1 },
];
const stock = [
  { id: "pvc12", unitCost: 3000 },
  { id: "paper", unitCost: 1000 },
  { id: "ink", unitCost: 4000 },
  { id: "matt", unitCost: 1000 },
];

test("a sheet's cost adds every material that applies", () => {
  assert.deepEqual(sheetCostFor(uses, stock, "12x12", "Matt"), { cost: 6000, unpriced: false });
  assert.deepEqual(sheetCostFor(uses, stock, "10x10", "Glossy"), { cost: 2000, unpriced: false });
});

test("a material that hasn't been bought yet flags the cost as incomplete", () => {
  assert.equal(sheetCostFor(uses, [{ id: "paper", unitCost: 0 }], "10x10", "Glossy").unpriced, true);
});

test("a product is by the sheet when it has a number of sheets", () => {
  assert.equal(isSheetCategory([{ name: "NOS (Number of Sheets)" }]), true);
  assert.equal(isSheetCategory([{ name: "Copies" }]), false);
  assert.equal(isSheetCategory([]), false);
});
