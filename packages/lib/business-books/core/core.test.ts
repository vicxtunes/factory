import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { AMING_CARD, SYSTEM, UNASSIGNED, balances, entryInputSchema, looksDuplicate, notes, paidByEmployee, totals, type BookLine } from "./index";

const line = (l: Partial<BookLine>): BookLine => ({
  source: "manual",
  sourceId: "x",
  occurredOn: "2026-11-10",
  createdAt: "2026-11-10T08:00:00Z",
  direction: "out",
  amount: 1000,
  account: "cash",
  toAccount: null,
  category: "Transport",
  description: null,
  projectId: null,
  employeeId: null,
  actorName: "Amina",
  ...l,
});

test("balances: opening balance plus lines from its opening day; moves shift money; system accounts as held", () => {
  const cash = { id: "cash", name: "Cash box", kind: "cash" as const, openingBalance: 50_000, openingOn: "2026-11-01" };
  const mtn = { id: "mtn", name: "MTN", kind: "mobile_money" as const, openingBalance: 0, openingOn: "2026-11-01" };
  const lines = [
    line({ occurredOn: "2026-10-30", direction: "in", amount: 99_000 }), // before cash opened: already in its opening balance
    line({ direction: "in", amount: 20_000, category: "Sales" }),
    line({ direction: "out", amount: 5_000 }),
    line({ direction: "move", amount: 10_000, account: "cash", toAccount: "mtn" }),
    line({ source: "system_withdrawal", direction: "move", amount: 30_000, account: SYSTEM, toAccount: "mtn" }),
    line({ source: "invoice_payment", direction: "in", amount: 7_000, account: UNASSIGNED, category: "Sales" }),
  ];
  const b = balances([cash, mtn], lines, { system: 12_345, amingCard: 0 });
  assert.equal(b.get("cash"), 50_000 + 20_000 - 5_000 - 10_000);
  assert.equal(b.get("mtn"), 10_000 + 30_000);
  assert.equal(b.get(SYSTEM), 12_345, "the business card's real balance, not worked out");
  assert.equal(b.get(AMING_CARD), 0);
  assert.equal(b.get(UNASSIGNED), 7_000, "money with no account yet shows on its own");
});

test("totals: in, out, profit and categories for the period; moves are neither", () => {
  const lines = [
    line({ direction: "in", amount: 100_000, category: "Sales" }),
    line({ direction: "out", amount: 30_000, category: "Rent" }),
    line({ direction: "out", amount: 10_000, category: "Transport" }),
    line({ direction: "out", amount: 5_000, category: "Transport" }),
    line({ direction: "move", amount: 40_000, account: "cash", toAccount: "mtn", category: null }),
    line({ occurredOn: "2026-12-01", direction: "out", amount: 999 }),
  ];
  const t = totals(lines, "2026-11-01", "2026-11-30");
  assert.equal(t.moneyIn, 100_000);
  assert.equal(t.moneyOut, 45_000);
  assert.equal(t.profit, 55_000);
  assert.deepEqual(t.outByCategory, [
    { category: "Rent", amount: 30_000 },
    { category: "Transport", amount: 15_000 },
  ]);
});

test("notes: a category that grew a lot, and a period spending more than it made", () => {
  const before = totals([line({ direction: "in", amount: 50_000, category: "Sales" }), line({ amount: 20_000 })], "2026-11-01", "2026-11-30");
  const now = totals([line({ direction: "in", amount: 10_000, category: "Sales" }), line({ amount: 40_000 })], "2026-11-01", "2026-11-30");
  assert.deepEqual(notes(now, before), ["Transport cost 100% more than the period before.", "Money out is more than money in for this period."]);
  assert.deepEqual(notes(before, before), []);
});

test("duplicates: same day, direction, amount and category, among hand entries only, not itself", () => {
  const lines = [line({ sourceId: "a" }), line({ source: "invoice_payment", sourceId: "b", direction: "in", category: "Sales" })];
  assert.equal(looksDuplicate(lines, { id: null, direction: "out", amount: 1000, occurredOn: "2026-11-10", category: "transport" }), true);
  assert.equal(looksDuplicate(lines, { id: "a", direction: "out", amount: 1000, occurredOn: "2026-11-10", category: "Transport" }), false, "editing itself");
  assert.equal(looksDuplicate(lines, { id: null, direction: "in", amount: 1000, occurredOn: "2026-11-10", category: "Sales" }), false, "receipts aren't hand entries");
});

test("pay: what each person was paid", () => {
  const paid = paidByEmployee([line({ employeeId: "e1", amount: 300_000 }), line({ employeeId: "e1", amount: 50_000 }), line({ employeeId: null })]);
  assert.equal(paid.get("e1"), 350_000);
  assert.equal(paid.size, 1);
});

test("entry input: a move needs another account; money in or out needs a category", () => {
  const base = { kind: "out", amount: 5000, occurredOn: "2026-11-10", accountId: "8a1d7c7e-4c2e-4a8e-9a55-2b0b8f0e1a11", category: "Fuel", note: "" };
  assert.equal(parseInput(entryInputSchema, base).category, "Fuel");
  assert.throws(() => parseInput(entryInputSchema, { ...base, category: "" }), /what it was for/);
  assert.throws(() => parseInput(entryInputSchema, { ...base, kind: "move", category: "" }), /different account/);
  assert.throws(() => parseInput(entryInputSchema, { ...base, kind: "move", category: "", toAccountId: base.accountId }), /different account/);
});
