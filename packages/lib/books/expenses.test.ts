import assert from "node:assert/strict";
import { test } from "node:test";

import { expenseBalance, expenseReminder, expenseStatus, type ExpenseLine } from "./expenses";

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

const money = (n: number) => String(n);

test("no reminder when nothing needs attention", () => {
  assert.equal(expenseReminder([], TODAY, money), null);
  assert.equal(
    expenseReminder(
      [
        line({ dueOn: "2026-11-07" }),
        line({ dueOn: "2026-11-01", paid: 100 }),
        line({ dueOn: "2026-11-01", voidedAt: "x" }),
        line({ dueOn: "2026-11-01", onCredit: true }),
        line({ dueOn: null }),
      ],
      TODAY,
      money,
    ),
    null,
  );
});

test("one reminder covers overdue, nearly due and waiting, with what's left on each", () => {
  const r = expenseReminder(
    [
      line({ name: "Water", dueOn: TODAY, amountIsEstimate: true }),
      line({ name: "Rent", dueOn: "2026-11-01", paid: 40 }),
      line({ name: "Power", dueOn: "2026-11-06" }),
      line({ name: "Repair", approval: "waiting", dueOn: "2026-11-01" }),
    ],
    TODAY,
    money,
  );
  assert.deepEqual(r, {
    title: "Expenses: 1 overdue, 2 due soon, 1 waiting for approval",
    body: "Overdue: Rent 60. Due soon: Water about 100, Power 100. Waiting for approval: Repair 100.",
  });
});

test("a long list stays short and still counts every bill", () => {
  const r = expenseReminder(Array.from({ length: 6 }, (_, i) => line({ name: `B${i}`, dueOn: "2026-11-01" })), TODAY, money);
  assert.equal(r?.title, "Expenses: 6 overdue");
  assert.equal(r?.body, "Overdue: B0 100, B1 100, B2 100, B3 100 and 2 more.");
});
