import assert from "node:assert/strict";
import { test } from "node:test";

import { interestShare, lenderAccounts, loanInputSchema, loanOverdue, loanOwed, weOwe, type Lender, type Loan } from "./index";

const loan = (over: Partial<Loan> = {}): Loan => ({
  id: "l1",
  lenderId: "a",
  lenderName: "Centenary SACCO",
  lenderKind: "lender",
  amount: 1_000_000,
  toRepay: 1_100_000,
  receivedOn: "2026-10-01",
  receivedInto: "bank_transfer",
  purchaseId: null,
  dueOn: null,
  note: null,
  actorName: "Boss",
  repaid: 0,
  interestPaid: 0,
  voidedAt: null,
  voidReason: null,
  ...over,
});

test("interest shares match the database's: pro rata, the last one takes what's left", () => {
  // The same three repayments as the migration check (36,364 + 30,303 + 33,333 = 100,000).
  assert.equal(interestShare(loan(), 400_000), 36_364);
  assert.equal(interestShare(loan({ repaid: 400_000, interestPaid: 36_364 }), 333_333), 30_303);
  assert.equal(interestShare(loan({ repaid: 733_333, interestPaid: 66_667 }), 366_667), 33_333);
});

test("no interest on a loan paid back as borrowed", () => {
  assert.equal(interestShare(loan({ toRepay: 1_000_000 }), 250_000), 0);
});

test("what's owed and overdue", () => {
  assert.equal(loanOwed(loan({ repaid: 400_000 })), 700_000);
  assert.equal(loanOwed(loan({ voidedAt: "2026-10-02T00:00:00Z" })), 0, "a voided loan is owed nothing");
  assert.equal(loanOverdue(loan({ dueOn: "2026-10-31" }), "2026-11-02"), 1_100_000);
  assert.equal(loanOverdue(loan({ dueOn: "2026-11-02" }), "2026-11-02"), 0, "due today isn't overdue yet");
  assert.equal(loanOverdue(loan(), "2026-11-02"), 0, "no due date, never overdue");
});

test("lenders' totals over live loans, most owed first", () => {
  const lenders: Lender[] = [
    { id: "a", name: "Centenary SACCO", phone: null, kind: "lender" },
    { id: "b", name: "Boss", phone: null, kind: "owner" },
    { id: "c", name: "Kampala Papers", phone: null, kind: "supplier" },
  ];
  const loans = [
    loan({ id: "1", repaid: 400_000, interestPaid: 36_364, dueOn: "2026-10-31" }),
    loan({ id: "2", lenderId: "b", amount: 2_000_000, toRepay: 2_000_000, dueOn: "2026-12-01" }),
    loan({ id: "3", lenderId: "b", amount: 500_000, toRepay: 500_000, voidedAt: "2026-10-05T00:00:00Z" }),
  ];
  const accounts = lenderAccounts(lenders, loans, "2026-11-02");
  assert.deepEqual(
    accounts.map((a) => [a.name, a.owed, a.overdue, a.nextDue]),
    [
      ["Boss", 2_000_000, 0, "2026-12-01"],
      ["Centenary SACCO", 700_000, 700_000, "2026-10-31"],
      ["Kampala Papers", 0, 0, null],
    ],
  );
  assert.equal(accounts[0].borrowed, 2_000_000, "the voided loan doesn't count");
  assert.deepEqual(weOwe(accounts), { owed: 2_700_000, overdue: 700_000, overdueCount: 1 });
});

test("money borrowed needs a lender, and can't be paid back with less", () => {
  const base = { amount: 500_000, toRepay: 550_000, receivedOn: "2026-11-01", receivedInto: "cash" };
  assert.ok(loanInputSchema.safeParse({ ...base, lenderId: "00000000-0000-4000-8000-000000000001" }).success);
  assert.ok(loanInputSchema.safeParse({ ...base, lender: { name: "Mama Grace", kind: "owner" } }).success);
  assert.ok(!loanInputSchema.safeParse(base).success, "no lender");
  assert.ok(!loanInputSchema.safeParse({ ...base, lender: { name: "X", kind: "owner" }, toRepay: 400_000 }).success);
  assert.ok(!loanInputSchema.safeParse({ ...base, lender: { name: "X", kind: "owner" }, dueOn: "2026-10-01" }).success, "due before received");
});
