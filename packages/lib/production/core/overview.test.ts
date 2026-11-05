import assert from "node:assert/strict";
import { test } from "node:test";

import { PartsCatalog, monthlyFigures, ordersWhere, periodFigures, shareRevenue, wastageByMaterial, type SoldItem, type SoldOrder } from "./index";

const item = (over: Partial<SoldItem>): SoldItem => ({ itemId: "i", productId: null, product: "Thing", variantId: null, qty: 1, unitPrice: null, attributes: {}, ...over });

test("an order's total is shared over its lines by their prices, adding up exactly", () => {
  const shares = shareRevenue({
    issuedAt: "",
    clientName: "",
    total: 100_000,
    items: [item({ itemId: "a", unitPrice: 10_000, qty: 1 }), item({ itemId: "b", unitPrice: 10_000, qty: 2 })],
  });
  assert.deepEqual([...shares.values()], [33_333, 66_667]);
  // Without prices, by quantity; a discounted total is shared the same way.
  assert.deepEqual([...shareRevenue({ issuedAt: "", clientName: "", total: 9_000, items: [item({ itemId: "a" }), item({ itemId: "b", qty: 2 })] }).values()], [3_000, 6_000]);
});

const part = (id: string, unitCost: number) => ({
  id, name: id, unit: "pc", kind: "material" as const, made: false, size: null, unitCost, productId: null, productName: null, productPrice: null, ownerProductId: null, active: true,
});
const line = (partId: string, perDetail: string | null = null) => ({ variantId: null, partId, byOrderSize: false, chosenDetail: null, qty: 1, perDetail, whenDetail: null, whenValue: null, label: null, amount: null });
const parts = new PartsCatalog({
  parts: [part("paper", 120), part("box", 2_000)],
  partLines: new Map(),
  productLines: new Map([["book", [line("paper", "Pages"), line("box")]]]),
  sheetPrices: new Map(), packaging: [],
});
/** As the service does it: a set-up product's estimate, else unknown. */
const estimate = (i: SoldItem) => {
  const setup = i.productId ? parts.setup(i.productId) : null;
  return setup?.isSetUp ? setup.evaluate({ variantId: i.variantId, details: i.attributes }).cost : null;
};

test("costs: recorded when there's a record, else the setup's estimate, else unknown (and shown)", () => {
  const figures = periodFigures(
    [
      {
        issuedAt: "",
        clientName: "",
        total: 300_000,
        items: [
          item({ itemId: "b1", productId: "book", product: "Photo book", qty: 1, unitPrice: 150_000, attributes: { Pages: 40 } }),
          item({ itemId: "b2", productId: "book", product: "Photo book", qty: 1, unitPrice: 150_000, attributes: { Pages: 40 } }),
        ],
      },
      { issuedAt: "", clientName: "", total: 15_000, items: [item({ itemId: "m1", productId: "mug", product: "Mug", unitPrice: 15_000 })] },
    ],
    new Map([["b1", 7_500]]),
    estimate,
  );
  // b1 recorded at 7,500; b2 estimated at 40 × 120 + 2,000 = 6,800; the mug isn't set up.
  assert.equal(figures.costRecorded, 7_500);
  assert.equal(figures.costEstimated, 6_800);
  assert.equal(figures.revenueNotSetUp, 15_000);
  assert.equal(figures.revenue, 315_000);
  assert.equal(figures.profit, 300_000 - 14_300, "the mug, not set up, isn't counted as profit");
  const [book, mug] = figures.products;
  assert.deepEqual([book.name, book.units, book.cost, book.estimated, book.marginPercent], ["Photo book", 2, 14_300, true, 95.2]);
  assert.deepEqual([mug.name, mug.notSetUp, mug.marginPercent], ["Mug", true, null]);
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

const order = (over: Partial<SoldOrder>): SoldOrder => ({ total: 0, issuedAt: "2026-10-05T10:00:00Z", clientName: "Grace", items: [], ...over });

test("month by month, oldest first, empty months as zeros", () => {
  const orders = [
    order({ total: 50_000, issuedAt: "2026-09-10T10:00:00Z", items: [item({ itemId: "a", productId: "mug", qty: 2 })] }),
    order({ total: 30_000, issuedAt: "2026-11-01T08:00:00Z", items: [item({ itemId: "b", productId: "mug", qty: 1 })] }),
  ];
  const months = monthlyFigures(orders, ["2026-09", "2026-10", "2026-11"], (iso) => iso.slice(0, 7), new Map(), () => null);
  assert.deepEqual(
    months.map((m) => [m.month, m.revenue, m.units]),
    [
      ["2026-09", 50_000, 2],
      ["2026-10", 0, 0],
      ["2026-11", 30_000, 1],
    ],
  );
});

test("one product's lines keep their share of each order's total", () => {
  const orders = ordersWhere(
    [
      order({ total: 90_000, items: [item({ itemId: "a", productId: "book", unitPrice: 60_000 }), item({ itemId: "b", productId: "mug", unitPrice: 30_000 })] }),
      order({ total: 10_000, items: [item({ itemId: "c", productId: "mug", unitPrice: 10_000 })] }),
    ],
    (i) => i.productId === "book",
  );
  assert.equal(orders.length, 1);
  assert.equal(orders[0].total, 60_000);
  assert.deepEqual(orders[0].items.map((i) => i.itemId), ["a"]);
});

test("margin counts only sales whose cost is known; none known, no margin", () => {
  const mug = { issuedAt: "", clientName: "", total: 15_000, items: [item({ itemId: "m", productId: "mug", product: "Mug", unitPrice: 15_000 })] };
  assert.equal(periodFigures([mug], new Map(), () => null).marginPercent, null, "nothing set up: not 100%");
  const book = { issuedAt: "", clientName: "", total: 10_000, items: [item({ itemId: "b", productId: "book", product: "Book", unitPrice: 10_000 })] };
  assert.equal(periodFigures([mug, book], new Map([["b", 4_000]]), () => null).marginPercent, 60, "the mug's sales left out");
});
