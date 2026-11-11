import assert from "node:assert/strict";
import { test } from "node:test";

import { Costing, costRows, photoBookSheetsProblem, priceFromMargin, productCosts, recipeInputSchema, materialInputSchema, type CostBook, type CostMaterial, type RecipeLine } from "./index";

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
  // Paper and Cover have no 10x10 selling price: counted as 0. 1,500 × 20 + 10,000 + 40,000.
  assert.equal(small.price, 80_000);
  assert.deepEqual(small.priceMissing, ["a selling price for Paper (10x10)", "a selling price for Cover (10x10)"], "says what was counted as 0");
});

test("anything not set counts as 0: the book still gets a price, and says what was left out", () => {
  const costing = new Costing(book());
  const noSheets = costing.quote("book", { variantId: null, details: { Size: "12x12", Lamination: "Matt" } });
  // Cover 3,000 + binding 5,000 + Matt 6,000 = 14,000 ÷ 0.6 = 23,333 − 20,000 → 3,500; + 20,000.
  assert.equal(noSheets.price, 23_500);
  assert.ok(noSheets.priceMissing.includes("Number of sheets"));
  const noRecipe = new Costing(book({ recipes: new Map([...book().recipes].filter(([id]) => id !== "vintage")) })).quote("book", order);
  assert.equal(noRecipe.price, 107_000, "Vintage X's cost counts as 0: 64,000 ÷ 0.6 → 66,667 − 40,000 → 27,000; + 40,000");
  assert.ok(noRecipe.missing.includes("Vintage X's recipe (its cost)"));
  const unpriced = new Costing(book({ products: book().products.map((p) => (p.id === "matt" ? { ...p, price: null } : p)) })).quote("book", order);
  assert.ok(unpriced.price !== null && unpriced.priceMissing.includes("a catalog price for Matt"), "an add-on with no price counts as 0");
  const empty = new Costing(book({ recipes: new Map() })).quote("book", { variantId: null, details: {} });
  assert.equal(empty.price, null, "no recipe: nothing to price, so on the call");
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
  assert.ok(at("8x8").priceMissing.includes("a catalog price for UV Print (Leather)"), "no 8x8 cover price: counted as 0");
});

test("a part's typed cost for a size is a cost of one: how many multiplies it", () => {
  const b = book();
  const cover = b.materials.find((m) => m.id === "Cover")!;
  cover.parts = [{ partId: "Wood", qty: 2, sizeTotals: { "12x12": 1_500 } }, { partId: "Cloth", qty: 1, sizeTotals: null }];
  const r = new Costing(b).rate(cover, "12x12");
  assert.equal(r.rate, 4_500, "2 × 1,500 typed + 1 × 1,500 own");
  assert.deepEqual(r.parts[0], { name: "Wood", qty: 2, rate: 1_500, cost: 3_000 });
});

test("a photo book has at least 10 sheets and at most its size's (8x8 15, 10x10 25, 12x12 30); other categories pass", () => {
  const book = (size: string, sheets: string) => photoBookSheetsProblem("Photo Books", { Size: size, "NOS (Number of Sheets)": sheets });
  assert.match(book("8x8", "5") ?? "", /at least 10 sheets \(this one has 5\)/);
  assert.equal(book("8x8", "10"), null);
  assert.equal(book("8x8", "15"), null);
  assert.match(book("8x8", "16") ?? "", /8x8 photo book has at most 15 sheets.*bigger size/);
  assert.equal(book("10x10", "25"), null);
  assert.match(book("10x10", "26") ?? "", /at most 25/);
  assert.equal(book("12x12", "30"), null);
  assert.match(book("12x12", "31") ?? "", /at most 30 sheets.*more than one book/);
  assert.equal(book("12 x 12", "20"), null);
  assert.equal(photoBookSheetsProblem("Photo Books", { Size: "12x12" }), null, "no sheets given: the form's required check says so");
  assert.equal(photoBookSheetsProblem("Prints", { "NOS (Number of Sheets)": "3" }), null);
});
