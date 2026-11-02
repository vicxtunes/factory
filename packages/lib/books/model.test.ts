import assert from "node:assert/strict";
import { test } from "node:test";

import { accountMoves, dayTotals, type DayLine } from "./model";

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
