import assert from "node:assert/strict";
import { test } from "node:test";

import { dayTotals } from "./model";

test("day totals: in, out and net, with money in no account shown apart", () => {
  const totals = dayTotals([
    { direction: "in", amount: 1000, accountId: "cash" },
    { direction: "in", amount: 300, accountId: null },
    { direction: "out", amount: 400, accountId: "cash" },
  ]);
  assert.deepEqual(totals, { moneyIn: 1300, moneyOut: 400, net: 900, inNoAccount: 300 });
});

test("day totals: an empty day is all zeros", () => {
  assert.deepEqual(dayTotals([]), { moneyIn: 0, moneyOut: 0, net: 0, inNoAccount: 0 });
});
