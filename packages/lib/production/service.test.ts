import assert from "node:assert/strict";
import { test } from "node:test";

import type { PartLine, PartsBook, UsageItem } from "./core";
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

const line = (over: Partial<PartLine>): PartLine => ({ variantId: null, partId: null, chosenDetail: null, qty: 1, perDetail: null, whenDetail: null, whenValue: null, label: null, amount: null, ...over });

const book: PartsBook = {
  parts: [{ id: PAPER, name: "Paper", unit: "sheet", kind: "material", made: false, unitCost: 120, clientPrice: null, productId: null, productName: null, productPrice: null, ownerProductId: null, active: true }],
  partLines: new Map(),
  productLines: new Map([["book", [line({ partId: PAPER, perDetail: "Pages" }), line({ variantId: "a4", qty: null, label: "Binding", amount: 3_000 })]]]),
  pricing: new Map(),
};

function fakeStore(saved: unknown[]): ProductionStore {
  return {
    usageItem: async (_s, id) => (id === ITEM ? item : null),
    usageQueue: async () => [item],
    partsBook: async () => book,
    recordUsage: async (_s, input) => {
      saved.push(input);
      return "r1";
    },
  } as Partial<ProductionStore> as ProductionStore;
}

test("what an item should use and its other costs come from its setup, not the browser", async () => {
  const saved: unknown[] = [];
  const usage = createUsage(fakeStore(saved));
  await usage.record(scope, { itemId: ITEM, actual: [{ materialId: PAPER, qty: 85 }, { materialId: GLUE, qty: 0.2 }], note: null }, actor);
  assert.deepEqual(saved, [
    {
      itemId: ITEM,
      // 2 books × 40 pages expected; 85 sheets used; glue not in the setup.
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
  const [queued] = await createUsage(fakeStore([])).queue(scope, 30);
  assert.equal(queued.isSetUp, true);
  assert.deepEqual(queued.expected, [{ materialId: PAPER, qty: 80 }]);
  assert.equal(queued.otherCost, 6_000);
});

test("an item that's gone or cancelled is refused", async () => {
  const usage = createUsage(fakeStore([]));
  await assert.rejects(usage.record(scope, { itemId: "00000000-0000-4000-8000-000000000009", actual: [], note: null }, actor), /no longer exists/);
});
