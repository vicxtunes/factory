import assert from "node:assert/strict";
import { test } from "node:test";

import { expenseBalance, expenseStatus, expenseTotals, type ExpenseLine } from "./expenses";

const TODAY = "2026-11-03";
const line = (o: Partial<ExpenseLine> = {}): ExpenseLine => ({
  id: "a",
  category: "rent",
  categoryName: "Rent",
  name: "Rent",
  description: null,
  recipient: null,
  amount: 100,
  amountIsEstimate: false,
  spentOn: "2026-11-01",
  dueOn: null,
  scheduleEvery: null,
  automatic: false,
  onCredit: false,
  paid: 0,
  approval: "approved",
  approvedBy: null,
  approvedAt: null,
  approvalNote: null,
  recordedBy: "Carol",
  recordedAt: "2026-11-01T08:00:00Z",
  voidedAt: null,
  voidReason: null,
  voidedBy: null,
  ...o,
});

test("status comes from the payments", () => {
  assert.equal(expenseStatus(line(), TODAY), "unpaid");
  assert.equal(expenseStatus(line({ paid: 40 }), TODAY), "part_paid");
  assert.equal(expenseStatus(line({ paid: 100 }), TODAY), "paid");
});

test("overdue only after the due day, and only while something is left", () => {
  assert.equal(expenseStatus(line({ dueOn: TODAY }), TODAY), "unpaid");
  assert.equal(expenseStatus(line({ dueOn: "2026-11-02" }), TODAY), "overdue");
  assert.equal(expenseStatus(line({ dueOn: "2026-11-02", paid: 40 }), TODAY), "overdue");
  assert.equal(expenseStatus(line({ dueOn: "2026-11-02", paid: 100 }), TODAY), "paid");
});

test("voided, rejected, waiting and on credit win over the rest", () => {
  assert.equal(expenseStatus(line({ voidedAt: "x", dueOn: "2026-01-01" }), TODAY), "voided");
  assert.equal(expenseStatus(line({ approval: "rejected" }), TODAY), "rejected");
  assert.equal(expenseStatus(line({ approval: "waiting", dueOn: "2026-01-01" }), TODAY), "waiting");
  assert.equal(expenseStatus(line({ onCredit: true }), TODAY), "on_credit");
});

test("nothing is owed on a voided, rejected or on-credit expense", () => {
  assert.equal(expenseBalance(line({ voidedAt: "x" })), 0);
  assert.equal(expenseBalance(line({ approval: "rejected" })), 0);
  assert.equal(expenseBalance(line({ onCredit: true })), 0);
  assert.equal(expenseBalance(line({ paid: 30 })), 70);
});

test("totals add up what's left, what's late and this month's spending", () => {
  const totals = expenseTotals(
    [
      line({ paid: 30 }),
      line({ dueOn: "2026-10-01", spentOn: "2026-10-01" }),
      line({ voidedAt: "x" }),
      line({ approval: "rejected" }),
    ],
    TODAY,
  );
  assert.deepEqual(totals, { toPay: 170, overdue: 100, spentThisMonth: 100 });
});
