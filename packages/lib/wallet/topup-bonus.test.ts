import assert from "node:assert/strict";
import { test } from "node:test";

import { validateTopupBonus } from "./policy";

const NOW = new Date("2026-10-31T09:00:00Z");
const ok = { percent: 5, minAmount: 200_000, startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" };

test("a top-up bonus is a whole percent from 1 to 100, with a minimum of 0 or more", () => {
  assert.deepEqual(validateTopupBonus(ok, NOW), []);
  assert.deepEqual(validateTopupBonus({ ...ok, minAmount: 0, startsAt: null, endsAt: null }, NOW), []);
  assert.match(validateTopupBonus({ ...ok, percent: 0 }, NOW)[0], /1 to 100/);
  assert.match(validateTopupBonus({ ...ok, percent: 2.5 }, NOW)[0], /1 to 100/);
  assert.match(validateTopupBonus({ ...ok, minAmount: -1 }, NOW)[0], /0 or more/);
});

test("a top-up bonus ends after it starts, and not in the past", () => {
  assert.match(validateTopupBonus({ ...ok, endsAt: "2026-10-31T23:00:00Z" }, NOW)[0], /end after it starts/);
  assert.match(validateTopupBonus({ ...ok, startsAt: null, endsAt: "2026-10-30T00:00:00Z" }, NOW)[0], /end after it starts|already past/);
});
