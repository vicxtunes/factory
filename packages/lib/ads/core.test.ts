import assert from "node:assert/strict";
import { test } from "node:test";

import { adPrice, adRefund, fromShillings, shouldAutoStop, toShillings } from "./core";

test("an ad's price is the budget plus Aming's fee on it", () => {
  assert.deepEqual(adPrice(10000, 7, 15), { budget: 70000, fee: 10500, total: 80500 });
  assert.deepEqual(adPrice(15000, 3, 0), { budget: 45000, fee: 0, total: 45000 });
  // The fee rounds up to a whole shilling.
  assert.equal(adPrice(10001, 1, 15).fee, 1501);
});

test("the unspent budget and its share of the fee come back, never more than was paid", () => {
  const ad = { budget: 70000, fee: 10500, charged: 80500 };
  assert.equal(adRefund(ad, 0), 80500);
  assert.equal(adRefund(ad, 35000), 35000 + 5250);
  assert.equal(adRefund(ad, 70000), 0);
  // Meta can overspend a little: nothing back, nothing owed.
  assert.equal(adRefund(ad, 72000), 0);
  // Spend in fractions counts up.
  assert.equal(adRefund(ad, 69999.2), 0);
});

test("an ad stops by itself only when it spent the limit and brought nobody", () => {
  assert.equal(shouldAutoStop(15000, 0, 15000), true);
  assert.equal(shouldAutoStop(14999, 0, 15000), false);
  assert.equal(shouldAutoStop(50000, 1, 15000), false);
});

test("money crosses between shillings and the ad account's currency", () => {
  assert.equal(toShillings(12.5, "USD", 3700), 46250);
  assert.equal(toShillings(5000, "UGX", 3700), 5000);
  assert.equal(fromShillings(10000, "USD", 3700), 2);
  assert.equal(fromShillings(10000, "UGX", 3700), 10000);
});
