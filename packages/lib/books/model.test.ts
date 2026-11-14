import assert from "node:assert/strict";
import { test } from "node:test";

import { accountMoves, dayTotals, type DayLine, hivepaySendGross } from "./model";

test("day totals: in, out and net, with money in no account shown apart", () => {
  const totals = dayTotals([
    { direction: "in", amount: 1000, accountId: "cash", kind: "sale_receipt" },
    { direction: "in", amount: 300, accountId: null, kind: "other" },
    { direction: "out", amount: 400, accountId: "cash", kind: "expense" },
  ]);
  assert.deepEqual(totals, { moneyIn: 1300, moneyOut: 400, net: 900, inNoAccount: 300 });
});

test("day totals: an empty day is all zeros", () => {
  assert.deepEqual(dayTotals([]), { moneyIn: 0, moneyOut: 0, net: 0, inNoAccount: 0 });
});

const banked: Pick<DayLine, "direction" | "amount" | "accountId" | "kind">[] = [
  { direction: "out", amount: 500, accountId: "cash", kind: "move" },
  { direction: "in", amount: 500, accountId: "bank", kind: "move" },
];

test("a move isn't money in or out of the business", () => {
  assert.deepEqual(dayTotals(banked), { moneyIn: 0, moneyOut: 0, net: 0, inNoAccount: 0 });
});

test("a move shows on each account it touched, and nowhere else", () => {
  const lines = [...banked, { direction: "in" as const, amount: 900, accountId: "cash", kind: "sale_receipt" as const }];
  assert.deepEqual(accountMoves(lines, "cash"), { movedIn: 0, movedOut: 500 });
  assert.deepEqual(accountMoves(lines, "bank"), { movedIn: 500, movedOut: 0 });
  assert.deepEqual(accountMoves(lines, "mobile"), { movedIn: 0, movedOut: 0 });
});

// HivePay's payout charges (its price list, 2026-11-14), as in 20270112100000.
const HIVEPAY = [
  { upTo: 50_000, fee: 1_000 },
  { upTo: 200_000, fee: 2_000 },
  { upTo: 400_000, fee: 2_700 },
  { upTo: 1_000_000, fee: 4_500 },
  { upTo: 5_000_000, fee: 9_200 },
];

test("hivepaySendGross: the amount plus HivePay's charge, like the database", () => {
  assert.equal(hivepaySendGross(10_000, HIVEPAY), 11_000);
  assert.equal(hivepaySendGross(48_000, HIVEPAY), 49_000);
  assert.equal(hivepaySendGross(49_500, HIVEPAY), 51_500); // crosses into the next band
  assert.equal(hivepaySendGross(300_000, HIVEPAY), 302_700);
  assert.equal(hivepaySendGross(4_990_000, HIVEPAY), 4_999_200);
  assert.equal(hivepaySendGross(10_000, []), 10_000); // no bands: as it is
});
