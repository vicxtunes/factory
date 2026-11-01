import assert from "node:assert/strict";
import { test } from "node:test";

import { costWith, expectedUsage, margin, productCosts, recipeFor, recipeInputSchema, unitCost, type RecipeLine } from "./index";

const A4 = "00000000-0000-4000-8000-0000000000a4";
const A3 = "00000000-0000-4000-8000-0000000000a3";
const PAGES = "pages";

const materials = [
  { id: "paper", kind: "material" as const, unitCost: 120 },
  { id: "cover", kind: "material" as const, unitCost: 4_500 },
  { id: "box", kind: "packaging" as const, unitCost: 2_000 },
  { id: "film", kind: "material" as const, unitCost: 37.5 },
];

const line = (over: Partial<RecipeLine>): RecipeLine => ({ variantId: null, materialId: null, qty: null, perAttributeId: null, label: null, amount: null, ...over });

const book: RecipeLine[] = [
  line({ materialId: "paper", qty: 1, perAttributeId: PAGES }),
  line({ materialId: "film", qty: 0.5, perAttributeId: PAGES }),
  line({ materialId: "box", qty: 1 }),
  line({ variantId: A4, materialId: "cover", qty: 1 }),
  line({ variantId: A4, label: "Binding", amount: 3_000 }),
  line({ variantId: A3, materialId: "cover", qty: 2 }),
];

test("a size's recipe is the shared lines plus its own", () => {
  assert.equal(recipeFor(book, A4).length, 5);
  assert.equal(recipeFor(book, A3).length, 4);
  assert.equal(recipeFor(book, null).length, 3, "a product without sizes: the shared lines");
});

test("a unit's cost splits materials, packaging and other costs; per-page lines apart", () => {
  const cost = unitCost(recipeFor(book, A4), materials);
  assert.deepEqual(
    { m: cost.materials, p: cost.packaging, o: cost.other, f: cost.fixed, unpriced: cost.unpriced },
    { m: 4_500, p: 2_000, o: 3_000, f: 9_500, unpriced: false },
  );
  // 120 + 0.5 × 37.5 = 138.75 per page.
  assert.deepEqual(cost.perDetail, [{ attributeId: PAGES, perOne: 138.75 }]);
  assert.equal(costWith(cost, { [PAGES]: 40 }), 9_500 + 5_550);
});

test("a material with no price, or gone, marks the cost unpriced", () => {
  assert.equal(unitCost([line({ materialId: "paper", qty: 1 })], [{ id: "paper", kind: "material", unitCost: 0 }]).unpriced, true);
  assert.equal(unitCost([line({ materialId: "gone", qty: 1 })], materials).unpriced, true);
});

test("profit and margin at the selling price", () => {
  assert.deepEqual(margin(25_000, 15_050), { profit: 9_950, percent: 39.8 });
  assert.deepEqual(margin(10_000, 12_000), { profit: -2_000, percent: -20 });
  assert.equal(margin(null, 5_000), null, "priced on a call: no margin yet");
});

test("what an order item should use: per-page lines × its pages, × units", () => {
  const usage = expectedUsage(recipeFor(book, A4), 2, (id) => (id === PAGES ? 40 : 0));
  assert.deepEqual(usage.materials, [
    { materialId: "paper", qty: 80 },
    { materialId: "film", qty: 40 },
    { materialId: "box", qty: 2 },
    { materialId: "cover", qty: 2 },
  ]);
  assert.equal(usage.otherCost, 6_000);
});

test("a recipe line is a material with a quantity, or a named cost", () => {
  const productId = "00000000-0000-4000-8000-000000000001";
  const ok = recipeInputSchema.safeParse({
    productId,
    lines: [
      { variantId: null, materialId: productId, qty: 1.5, perAttributeId: null },
      { variantId: A4, label: "Binding", amount: 3_000 },
    ],
  });
  assert.ok(ok.success);
  assert.ok(!recipeInputSchema.safeParse({ productId, lines: [{ variantId: null, materialId: productId, qty: 0, perAttributeId: null }] }).success);
  assert.ok(!recipeInputSchema.safeParse({ productId, lines: [{ variantId: null, label: " ", amount: 10 }] }).success);
});

test("each product size with its cost, price and margin; per-page products get no margin", () => {
  const catalog = [
    {
      id: "c1",
      name: "Photo books",
      attributes: [{ id: PAGES, name: "Pages", type: "number" }],
      products: [
        { id: "book", name: "Photo book", price: null, unit: "Pc", variants: [{ id: A4, name: "A4", price: 150_000 }] },
        { id: "frame", name: "Frame", price: 25_000, unit: "Pc", variants: [] },
        { id: "mug", name: "Mug", price: 15_000, unit: "Pc", variants: [] },
      ],
    },
  ];
  const recipes = new Map([
    ["book", book],
    ["frame", [line({ materialId: "cover", qty: 2 }), line({ materialId: "box", qty: 1 })]],
  ]);
  const [b, f, m] = productCosts(catalog, recipes, materials);
  assert.deepEqual(b.sizes[0].perDetail, [{ name: "Pages", perOne: 138.75 }]);
  assert.equal(b.sizes[0].margin, null);
  assert.equal(f.sizes[0].name, null, "a product without sizes is one row");
  assert.deepEqual(f.sizes[0].margin, { profit: 25_000 - 11_000, percent: 56 });
  assert.equal(m.hasRecipe, false);
  assert.equal(m.sizes[0].margin, null, "no recipe, no margin");
});
