import assert from "node:assert/strict";
import { test } from "node:test";

import { PartsCatalog, copySetupSchema, margin, mergeUsage, partLineSchema, productCosts, setupInputSchema, type PartLine, type PartRow } from "./index";

const A4 = "00000000-0000-4000-8000-0000000000a4";
const ID = "00000000-0000-4000-8000-000000000001";

const part = (id: string, unitCost: number, over: Partial<PartRow> = {}): PartRow => ({
  id, name: id, unit: "pc", kind: "material", made: false, size: null, unitCost, productId: null, productName: null, productPrice: null, ownerProductId: null, active: true, ...over,
});
const line = (over: Partial<PartLine>): PartLine => ({ variantId: null, partId: null, byOrderSize: false, productPartId: null, addsPrice: false, sizes: null, qty: 1, perDetail: null, whenDetail: null, whenValue: null, label: null, amount: null, ...over });

test("profit and margin at the selling price", () => {
  assert.deepEqual(margin(25_000, 15_050), { profit: 9_950, percent: 39.8 });
  assert.deepEqual(margin(10_000, 12_000), { profit: -2_000, percent: -20 });
  assert.equal(margin(null, 5_000), null, "priced on a call: no margin yet");
});

test("a line is a part (or the one chosen) with a quantity, or a named cost", () => {
  assert.ok(setupInputSchema.safeParse({ productId: ID, lines: [{ partId: ID, qty: 1.5, perDetail: "NOS" }, { label: "Binding", amount: 3_000 }, { productPartId: ID, addsPrice: true, qty: 1, sizes: ["12x12"] }] }).success);
  assert.ok(!partLineSchema.safeParse({ partId: ID, qty: 0 }).success);
  assert.ok(!partLineSchema.safeParse({ label: " ", amount: 10 }).success);
  assert.ok(!partLineSchema.safeParse({ partId: ID, productPartId: ID, qty: 1 }).success, "a part or a product, not both");
  assert.ok(!partLineSchema.safeParse({ partId: ID, addsPrice: true, qty: 1 }).success, "only a product adds its price");
  assert.ok(!partLineSchema.safeParse({ partId: ID, qty: 1, whenDetail: "Lamination" }).success, "only when needs its value");
  assert.ok(!copySetupSchema.safeParse({ from: ID, to: ID }).success);
});

test("each product size with its cost, price and margin; per-page products by the page", () => {
  const catalog = [
    {
      id: "c1",
      name: "Photo books",
      attributes: [],
      products: [
        { id: "book", name: "Photo book", price: null, unit: "Pc", variants: [{ id: A4, name: "A4", price: 150_000 }] },
        { id: "frame", name: "Frame", price: 25_000, unit: "Pc", variants: [] },
        { id: "mug", name: "Mug", price: 15_000, unit: "Pc", variants: [] },
      ],
    },
  ];
  const parts = new PartsCatalog({
    parts: [part("paper", 120), part("cover", 4_500), part("box", 2_000)],
    partLines: new Map(),
    productLines: new Map([
      ["book", [line({ partId: "paper", perDetail: "Pages" }), line({ partId: "box" }), line({ variantId: A4, partId: "cover" })]],
      ["frame", [line({ partId: "cover", qty: 2 }), line({ partId: "box" })]],
    ]),
    sheetPrices: new Map(), products: [],
  });
  const [b, f, m] = productCosts(catalog, parts);
  assert.deepEqual([b.rows[0].cost, b.rows[0].perDetail], [6_500, [{ name: "Pages", cost: 120 }]]);
  assert.equal(b.rows[0].margin, null, "its cost depends on the pages");
  assert.equal(f.rows[0].name, null, "a product without sizes is one row");
  assert.deepEqual(f.rows[0].margin, { profit: 25_000 - 11_000, percent: 56, per: null });
  assert.deepEqual([m.isSetUp, m.rows], [false, []]);
});

test("saved lines: everything expected (actual defaults to it) plus extra materials used", () => {
  const lines = mergeUsage(
    [
      { materialId: "paper", qty: 40 },
      { materialId: "box", qty: 1 },
    ],
    [
      { materialId: "paper", qty: 44 },
      { materialId: "film", qty: 3 },
      { materialId: "glue", qty: 0 },
    ],
  );
  assert.deepEqual(lines, [
    { materialId: "paper", expectedQty: 40, actualQty: 44 },
    { materialId: "box", expectedQty: 1, actualQty: 1 },
    { materialId: "film", expectedQty: 0, actualQty: 3 },
  ]);
});
