import assert from "node:assert/strict";
import { test } from "node:test";

import { Costing, costRows, priceFromMargin, productCosts, recipeInputSchema, materialInputSchema, type CostBook, type CostMaterial, type RecipeLine } from "./index";

const material = (id: string, over: Partial<CostMaterial> = {}): CostMaterial => ({
  id,
  name: id,
  unit: "pc",
  costBy: "one",
  cost: 0,
  sizeCosts: {},
  parts: [],
  sellPrice: null,
  sizeSells: {},
  active: true,
  ...over,
});
const line = (materialId: string, over: Partial<RecipeLine> = {}): RecipeLine => ({
  materialId,
  qty: 1,
  perSheet: false,
  sizes: null,
  whenDetail: null,
  whenValue: null,
  sellPrice: null,
  sizeSells: null,
  ...over,
});

// The owner's prototype, with the catalog's add-ons.
const book = (over: Partial<CostBook> = {}): CostBook => ({
  materials: [
    material("Paper", { costBy: "size", sizeCosts: { "12x12": 1_500, "10x10": 1_000 }, sizeSells: { "12x12": 2_500 } }),
    material("Printing", { cost: 1_000, sellPrice: 1_500 }),
    material("Wood"),
    material("Cloth", { cost: 1_500 }),
    material("Cover", { costBy: "parts", parts: [{ partId: "Wood", qty: 1, sizeTotals: { "12x12": 1_500, "10x10": 1_000 } }, { partId: "Cloth", qty: 1, sizeTotals: null }], sizeSells: { "12x12": 25_000 } }),
    material("Binding", { cost: 5_000, sellPrice: 8_000 }),
    material("Film", { cost: 6_000 }),
    material("Box", { cost: 12_000 }),
    material("Acrylic", { cost: 15_000 }),
    material("Photo", { cost: 3_000 }),
  ],
  recipes: new Map([
    ["book", [line("Paper", { perSheet: true }), line("Printing", { perSheet: true }), line("Cover"), line("Binding", { sellPrice: 10_000 })]],
    ["matt", [line("Film")]],
    ["vintage", [line("Box")]],
    ["board", [line("Photo", { perSheet: true }), line("Acrylic", { whenDetail: "Type", whenValue: "Crystal" })]],
  ]),
  products: [
    { id: "book", name: "Photobook", categoryName: "Photo Books", price: null, variants: [], autoPrice: "margin", margin: null },
    { id: "matt", name: "Matt", categoryName: "Lamination", price: 20_000, variants: [], autoPrice: null, margin: null },
    { id: "vintage", name: "Vintage X", categoryName: "Packaging", price: 20_000, variants: [], autoPrice: null, margin: null },
    { id: "board", name: "Board", categoryName: "Boards", price: 40_000, variants: [], autoPrice: null, margin: null },
  ],
  margin: 0.4,
  ...over,
});

const order = { variantId: null, details: { Size: "12x12", "NOS (Number of Sheets)": "20", Lamination: "Matt", Packaging: "Vintage X" } };

test("a photo book's cost: per-sheet lines × NOS, a built cover in the order's size, and its add-ons' own recipes", () => {
  const q = new Costing(book()).quote("book", order);
  assert.deepEqual(
    q.lines.map((l) => [l.name, l.qty, l.cost]),
    [
      ["Paper (12x12)", 20, 30_000],
      ["Printing", 20, 20_000],
      ["Cover (12x12)", 1, 3_000],
      ["Binding", 1, 5_000],
    ],
  );
  assert.deepEqual(q.lines[2].parts.map((p) => [p.name, p.cost]), [["Wood", 1_500], ["Cloth", 1_500]]);
  assert.deepEqual(q.addOns.map((a) => [a.name, a.price, a.cost]), [["Matt", 20_000, 6_000], ["Vintage X", 20_000, 12_000]]);
  assert.equal(q.cost, 76_000);
  assert.deepEqual(q.missing, []);
});

test("from the margin: on the whole book with its add-ons, the base rounded up to 500", () => {
  const q = new Costing(book()).quote("book", order);
  // 76,000 ÷ 0.6 = 126,667; less the add-ons' 40,000 = 86,667 → 87,000; + 40,000.
  assert.equal(q.price, 127_000);
  assert.equal(q.margin, 0.4);
  assert.equal(priceFromMargin(1_000, 0.4, 5_000), 5_000, "never below the add-ons' prices");
  const own = new Costing(book({ products: book().products.map((p) => (p.id === "book" ? { ...p, margin: 0.5 } : p)) })).quote("book", order);
  assert.equal(own.price, 152_000, "a book's own margin wins: 152,000 − 40,000 = 112,000");
});

test("from the materials: each line's selling price (the book's own first) × its quantity, + the add-ons' catalog prices", () => {
  const c = book({ products: book().products.map((p) => (p.id === "book" ? { ...p, autoPrice: "materials" } : p)) });
  // 2,500 × 20 + 1,500 × 20 + 25,000 + 10,000 (the book's own Binding price) + 40,000.
  assert.equal(new Costing(c).quote("book", order).price, 155_000);
  const small = new Costing(c).quote("book", { ...order, details: { ...order.details, Size: "10x10" } });
  assert.equal(small.price, null, "Paper and Cover have no 10x10 selling price");
  assert.deepEqual(small.priceMissing, ["a selling price for Paper (10x10)", "a selling price for Cover (10x10)"], "says what's missing");
});

test("with something missing a photo book is priced on the call, and says why", () => {
  const costing = new Costing(book());
  const noSheets = costing.quote("book", { variantId: null, details: { Size: "12x12", Lamination: "Matt" } });
  assert.equal(noSheets.price, null);
  assert.ok(noSheets.priceMissing.includes("Number of sheets"));
  const noRecipe = new Costing(book({ recipes: new Map([...book().recipes].filter(([id]) => id !== "vintage")) })).quote("book", order);
  assert.equal(noRecipe.price, null, "an add-on's cost isn't known, so the margin can't be reached");
  assert.ok(noRecipe.missing.includes("Vintage X's recipe (its cost)"));
});

test("every other product keeps its catalog price; per sheet is for photo books only; lines can be only when", () => {
  const costing = new Costing(book());
  const normal = costing.quote("board", { variantId: null, details: { Type: "Normal", NOS: "20" } });
  assert.equal(normal.cost, 3_000, "per sheet ignored, acrylic left out");
  assert.equal(normal.price, null);
  assert.equal(costing.quote("board", { variantId: null, details: { Type: "Crystal" } }).cost, 18_000);
});

test("the costs list: a photo book's cost with no sheets and what each sheet adds; a catalog product's margin", () => {
  const costing = new Costing(book());
  const [row] = costRows(costing, costing.product("book")!, ["12x12"]);
  assert.deepEqual([row.cost, row.perSheet, row.price], [8_000, 2_500, null]);
  const costs = productCosts([{ id: "c", name: "Boards", attributes: [], products: [{ id: "board", name: "Board", price: 40_000, unit: null, variants: [] }] }], costing);
  assert.deepEqual(costs[0].rows[0].margin, { profit: 37_000, percent: 92.5 });
});

test("inputs: a built material needs its parts; a recipe line's “only when” needs both halves", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.ok(!materialInputSchema.safeParse({ name: "Cover", unit: "pc", costBy: "parts", parts: [] }).success);
  assert.ok(materialInputSchema.safeParse({ name: "Cover", unit: "pc", costBy: "parts", parts: [{ partId: id, qty: 1, sizeTotals: { "12x12": 1500 } }] }).success);
  assert.ok(!recipeInputSchema.safeParse({ productId: id, lines: [{ materialId: id, qty: 1, whenDetail: "Type" }] }).success);
  assert.ok(!recipeInputSchema.safeParse({ productId: id, lines: [{ materialId: id, qty: 0 }] }).success);
});

test("a cover type is an add-on priced by the order's size, with its own recipe's cost", () => {
  const b = book();
  b.products.push({ id: "uv", name: "UV Print (Leather)", categoryName: "Cover Type", price: null, variants: [{ id: "uv12", name: "12x12", price: 30_000 }, { id: "uv10", name: "10x10", price: 25_000 }], autoPrice: null, margin: null });
  b.recipes.set("uv", [line("Cloth")]);
  const costing = new Costing(b);
  const at = (Size: string) => costing.quote("book", { variantId: null, details: { ...order.details, Size, "Cover Type": "UV Print (Leather)" } });
  const big = at("12x12");
  assert.deepEqual(big.addOns.find((a) => a.kind === "Cover Type"), { kind: "Cover Type", name: "UV Print (Leather)", price: 30_000, cost: 1_500, hasRecipe: true });
  assert.equal(big.cost, 77_500, "76,000 + the cover's 1,500");
  assert.equal(at("10x10").addOns.find((a) => a.kind === "Cover Type")?.price, 25_000);
  assert.equal(at("8x8").price, null, "no 8x8 cover price: priced on the call");
});
