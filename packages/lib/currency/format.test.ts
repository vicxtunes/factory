import assert from "node:assert/strict";
import { test } from "node:test";

import { BASE_CURRENCY, convert, formatIn, formatMoney, rateText, toUgx } from "./format";

const KES = { code: "KES", rate: 1 / 28, decimals: 0 };
const USD = { code: "USD", rate: 1 / 3650, decimals: 2 };

test("UGX stays as stored: whole shillings with its code", () => {
  assert.equal(formatIn(120_000, BASE_CURRENCY), "UGX 120,000");
  assert.equal(formatMoney(120_000), "UGX 120,000");
});

test("other currencies convert at their rate, with their own decimals", () => {
  assert.equal(formatIn(120_000, KES), "KES 4,286");
  assert.equal(formatIn(120_000, USD), "USD 32.88");
  assert.equal(convert(265_000, USD), 72.6);
  assert.equal(formatIn(null, KES), "KES 0");
});

test("an amount typed in another currency comes back as whole shillings", () => {
  assert.equal(toUgx(1_000, KES), 28_000);
  assert.equal(toUgx(32.88, USD), 120_012);
});

test("a rate reads the way people say it", () => {
  assert.equal(rateText(KES), "1 KES = 28 UGX");
  assert.equal(rateText(USD), "1 USD = 3,650 UGX");
});
