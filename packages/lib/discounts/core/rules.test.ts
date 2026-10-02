import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiscountInput } from "./model";
import { discountStatus, discountedPrice, offerBadge, parseOffer, validateDiscount } from "./rules";

const NOW = new Date("2026-10-15T09:00:00Z");

test("status: scheduled, running, ended", () => {
  assert.equal(discountStatus({ startsAt: "2026-10-16T00:00:00Z", endsAt: null }, NOW), "scheduled");
  assert.equal(discountStatus({ startsAt: "2026-10-01T00:00:00Z", endsAt: null }, NOW), "running");
  assert.equal(discountStatus({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-20T00:00:00Z" }, NOW), "running");
  assert.equal(discountStatus({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-15T09:00:00Z" }, NOW), "ended");
});

const ok: DiscountInput = { name: "Promo", kind: "percent", value: 10, appliesTo: "all", productIds: [], startsAt: null, endsAt: null };

test("a valid discount has no errors", () => {
  assert.deepEqual(validateDiscount(ok, NOW), []);
  assert.deepEqual(validateDiscount({ ...ok, kind: "amount", value: 5000, appliesTo: "products", productIds: ["p"] }, NOW), []);
});

test("invalid discounts explain themselves", () => {
  assert.deepEqual(validateDiscount({ ...ok, name: "  " }, NOW), ["Give the discount a name."]);
  assert.deepEqual(validateDiscount({ ...ok, value: 0 }, NOW), ["The discount must be a whole number above 0."]);
  assert.deepEqual(validateDiscount({ ...ok, value: 2.5 }, NOW), ["The discount must be a whole number above 0."]);
  assert.deepEqual(validateDiscount({ ...ok, value: 101 }, NOW), ["A percentage can't be more than 100."]);
  assert.deepEqual(validateDiscount({ ...ok, appliesTo: "products" }, NOW), ["Choose at least one product."]);
  assert.deepEqual(validateDiscount({ ...ok, startsAt: "2026-10-20T00:00:00Z", endsAt: "2026-10-19T00:00:00Z" }, NOW), [
    "It has to end after it starts.",
  ]);
  assert.deepEqual(validateDiscount({ ...ok, endsAt: "2026-10-14T00:00:00Z" }, NOW), ["It has to end after it starts."]);
});

test("discounted price matches the database's arithmetic", () => {
  assert.equal(discountedPrice(100_000, "percent", 10), 90_000);
  assert.equal(discountedPrice(99_999, "percent", 15), 84_999); // 84999.15 rounds
  assert.equal(discountedPrice(100_000, "percent", 100), 0);
  assert.equal(discountedPrice(30_000, "amount", 5_000), 25_000);
  assert.equal(discountedPrice(3_000, "amount", 5_000), 0, "never below zero");
});

test("offers are read defensively", () => {
  assert.deepEqual(parseOffer({ discountId: "d", name: "Promo", kind: "percent", value: 10, listPrice: 100000, price: "90000" }), {
    discountId: "d",
    name: "Promo",
    kind: "percent",
    value: 10,
    listPrice: 100000,
    price: 90000,
  });
  assert.equal(parseOffer(null), null);
  assert.equal(parseOffer({ discountId: "d", kind: "bogus", listPrice: 1, price: 1 }), null);
  assert.equal(parseOffer({ kind: "percent", listPrice: 1, price: 1 }), null);
});

test("badges", () => {
  assert.equal(offerBadge({ kind: "percent", value: 10 }, String), "−10%");
  assert.equal(offerBadge({ kind: "amount", value: 5000 }, (n) => `UGX ${n.toLocaleString("en-UG")}`), "−UGX 5,000");
});
