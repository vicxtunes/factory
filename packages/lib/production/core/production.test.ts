import assert from "node:assert/strict";
import { test } from "node:test";

import { formatQty, formatUnitCost, purchaseInputSchema, stockCountSchema, unitCostOf } from "./index";

const purchase = {
  materialId: "00000000-0000-4000-8000-000000000001",
  qty: 500,
  total: 50000,
  supplier: "Kampala Papers",
  paidFrom: "cash",
  purchasedOn: "2026-11-02",
};

test("a purchase's unit price keeps 4 decimal places, as the database does", () => {
  assert.equal(unitCostOf(50000, 500), 100);
  assert.equal(unitCostOf(1000, 3), 333.3333);
  assert.equal(unitCostOf(75, 2), 37.5);
});

test("quantities and unit prices read plainly", () => {
  assert.equal(formatQty(1250.5), "1,250.5");
  assert.equal(formatQty(40), "40");
  assert.equal(formatUnitCost(37.5, "UGX"), "UGX 37.5");
  assert.equal(formatUnitCost(1200, "UGX"), "UGX 1,200");
});

test("a purchase needs a quantity, a whole-shilling total and a date", () => {
  assert.ok(purchaseInputSchema.safeParse(purchase).success);
  assert.ok(!purchaseInputSchema.safeParse({ ...purchase, qty: 0 }).success);
  assert.ok(!purchaseInputSchema.safeParse({ ...purchase, total: 100.5 }).success);
  assert.ok(!purchaseInputSchema.safeParse({ ...purchase, qty: 1.2345 }).success, "at most 3 decimal places");
  assert.ok(!purchaseInputSchema.safeParse({ ...purchase, purchasedOn: "" }).success);
});

test("on credit needs the supplier we owe", () => {
  assert.ok(purchaseInputSchema.safeParse({ ...purchase, paidFrom: "on_credit" }).success);
  const res = purchaseInputSchema.safeParse({ ...purchase, paidFrom: "on_credit", supplier: "  " });
  assert.ok(!res.success);
  assert.deepEqual(res.error?.issues[0]?.path, ["supplier"]);
});

test("a stock count can't be below zero and says why", () => {
  const count = { materialId: purchase.materialId, counted: 12.5, reason: "Counted on Friday" };
  assert.ok(stockCountSchema.safeParse(count).success);
  assert.ok(!stockCountSchema.safeParse({ ...count, counted: -1 }).success);
  assert.ok(!stockCountSchema.safeParse({ ...count, reason: " " }).success);
});
