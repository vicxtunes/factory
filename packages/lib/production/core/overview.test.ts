import assert from "node:assert/strict";
import { test } from "node:test";

import { periodFigures, shareRevenue, wastageByMaterial, type RecipeLine, type SoldItem } from "./index";

const item = (over: Partial<SoldItem>): SoldItem => ({ itemId: "i", productId: null, product: "Thing", variantId: null, qty: 1, unitPrice: null, attributes: {}, ...over });

test("an order's total is shared over its lines by their prices, adding up exactly", () => {
  const shares = shareRevenue({
    total: 100_000,
    items: [item({ itemId: "a", unitPrice: 10_000, qty: 1 }), item({ itemId: "b", unitPrice: 10_000, qty: 2 })],
  });
  assert.deepEqual([...shares.values()], [33_333, 66_667]);
  // Without prices, by quantity; a discounted total is shared the same way.
  assert.deepEqual([...shareRevenue({ total: 9_000, items: [item({ itemId: "a" }), item({ itemId: "b", qty: 2 })] }).values()], [3_000, 6_000]);
});

const materials = [
  { id: "paper", kind: "material" as const, unitCost: 120 },
  { id: "box", kind: "packaging" as const, unitCost: 2_000 },
];
const recipes = new Map<string, RecipeLine[]>([
  [
    "book",
    [
      { variantId: null, materialId: "paper", qty: 1, perAttributeId: "pages", label: null, amount: null },
      { variantId: null, materialId: "box", qty: 1, perAttributeId: null, label: null, amount: null },
    ],
  ],
]);
const names = new Map([["pages", "Pages"]]);

test("costs: recorded when there's a record, else the recipe's estimate, else unknown (and shown)", () => {
  const figures = periodFigures(
    [
      {
        total: 300_000,
        items: [
          item({ itemId: "b1", productId: "book", product: "Photo book", qty: 1, unitPrice: 150_000, attributes: { Pages: 40 } }),
          item({ itemId: "b2", productId: "book", product: "Photo book", qty: 1, unitPrice: 150_000, attributes: { Pages: 40 } }),
        ],
      },
      { total: 15_000, items: [item({ itemId: "m1", productId: "mug", product: "Mug", unitPrice: 15_000 })] },
    ],
    new Map([["b1", 7_500]]),
    recipes,
    materials,
    names,
  );
  // b1 recorded at 7,500; b2 estimated at 40 × 120 + 2,000 = 6,800; the mug has no recipe.
  assert.equal(figures.costRecorded, 7_500);
  assert.equal(figures.costEstimated, 6_800);
  assert.equal(figures.revenueWithoutRecipe, 15_000);
  assert.equal(figures.revenue, 315_000);
  assert.equal(figures.profit, 315_000 - 14_300);
  const [book, mug] = figures.products;
  assert.deepEqual([book.name, book.units, book.cost, book.estimated, book.marginPercent], ["Photo book", 2, 14_300, true, 95.2]);
  assert.deepEqual([mug.name, mug.noRecipe, mug.marginPercent], ["Mug", true, null]);
});

test("wastage by material: beyond what was expected, net of savings, most first", () => {
  const w = wastageByMaterial([
    { materialId: "paper", name: "Paper", unit: "sheet", expectedQty: 40, actualQty: 44, unitCost: 120 },
    { materialId: "paper", name: "Paper", unit: "sheet", expectedQty: 40, actualQty: 39, unitCost: 120 },
    { materialId: "box", name: "Box", unit: "pc", expectedQty: 1, actualQty: 2, unitCost: 2_000 },
    { materialId: "glue", name: "Glue", unit: "ml", expectedQty: 5, actualQty: 5, unitCost: 10 },
  ]);
  assert.deepEqual(
    w.map((f) => [f.name, f.qty, f.value]),
    [
      ["Box", 1, 2_000],
      ["Paper", 3, 360],
    ],
  );
});
