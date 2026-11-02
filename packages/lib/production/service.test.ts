import assert from "node:assert/strict";
import { test } from "node:test";

import type { RecipeLine, UsageItem } from "./core";
import type { ProductionStore } from "./ports";
import { createUsage } from "./service";

const scope = { tenantId: "t", currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" };
const actor = { id: "u", name: "Supervisor" };
const ITEM = "00000000-0000-4000-8000-000000000001";
const PAPER = "00000000-0000-4000-8000-0000000000aa";
const GLUE = "00000000-0000-4000-8000-0000000000bb";

const item: UsageItem = {
  itemId: ITEM,
  orderNo: "2026-4001",
  clientName: "Grace",
  product: "Photo book",
  productId: "book",
  variantId: "a4",
  sizeName: "A4",
  qty: 2,
  attributes: { Pages: 40 },
  status: "quality_check",
  updatedAt: "2026-11-02T08:00:00Z",
};

const recipe: RecipeLine[] = [
  { variantId: null, materialId: PAPER, qty: 1, perAttributeId: "pages", label: null, amount: null },
  { variantId: "a4", materialId: null, qty: null, perAttributeId: null, label: "Binding", amount: 3_000 },
];

const catalog = [{ id: "c", name: "Photo books", attributes: [{ id: "pages", name: "Pages", type: "number" }], products: [] }];

function fakeStore(saved: unknown[]): ProductionStore {
  return {
    usageItem: async (_s, id) => (id === ITEM ? item : null),
    usageQueue: async () => [item],
    recipes: async () => new Map([["book", recipe]]),
    recordUsage: async (_s, input) => {
      saved.push(input);
      return "r1";
    },
  } as Partial<ProductionStore> as ProductionStore;
}

test("what an item should use and its other costs come from its recipe, not the browser", async () => {
  const saved: unknown[] = [];
  const usage = createUsage(fakeStore(saved));
  await usage.record(scope, catalog, { itemId: ITEM, actual: [{ materialId: PAPER, qty: 85 }, { materialId: GLUE, qty: 0.2 }], note: null }, actor);
  assert.deepEqual(saved, [
    {
      itemId: ITEM,
      // 2 books × 40 pages expected; 85 sheets used; glue not in the recipe.
      lines: [
        { materialId: PAPER, expectedQty: 80, actualQty: 85 },
        { materialId: GLUE, expectedQty: 0, actualQty: 0.2 },
      ],
      otherCost: 6_000,
      note: null,
    },
  ]);
});

test("the queue shows each item's expected usage", async () => {
  const [queued] = await createUsage(fakeStore([])).queue(scope, catalog, 30);
  assert.equal(queued.hasRecipe, true);
  assert.deepEqual(queued.expected, [{ materialId: PAPER, qty: 80 }]);
  assert.equal(queued.otherCost, 6_000);
});

test("an item that's gone or cancelled is refused", async () => {
  const usage = createUsage(fakeStore([]));
  await assert.rejects(usage.record(scope, catalog, { itemId: "00000000-0000-4000-8000-000000000009", actual: [], note: null }, actor), /no longer exists/);
});
