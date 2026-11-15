import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExpenseLine } from "./expenses";
import { payDayLabel, rateUnit, slipGross, slipState } from "./staff-pay";

const expense = (patch: Partial<ExpenseLine> = {}) => ({ amount: 300000, paid: 0, voidedAt: null, approval: "approved", onCredit: false, payoutSending: false, ...patch }) as ExpenseLine;

test("a payslip's state follows its expense", () => {
  assert.equal(slipState({ net: null, expense: null }), "needs_days");
  assert.equal(slipState({ net: 0, expense: null }), "nothing_to_pay");
  assert.equal(slipState({ net: 300000, expense: expense() }), "to_pay");
  assert.equal(slipState({ net: 300000, expense: expense({ paid: 100000 }) }), "to_pay");
  assert.equal(slipState({ net: 300000, expense: expense({ payoutSending: true }) }), "sending");
  assert.equal(slipState({ net: 300000, expense: expense({ paid: 300000 }) }), "paid");
  assert.equal(slipState({ net: 300000, expense: expense({ voidedAt: "2026-11-15T10:00:00Z" }) }), "cancelled");
});

test("gross is basic plus every allowance", () => {
  assert.equal(slipGross({ basic: 300000, allowances: [{ name: "Transport", amount: 50000, once: false }, { name: "Overtime", amount: 20000, once: true }] }), 370000);
  assert.equal(slipGross({ basic: null, allowances: [] }), 0);
});

test("pay day and rate in words", () => {
  assert.equal(payDayLabel("month", 1), "on the 1st of each month");
  assert.equal(payDayLabel("month", 22), "on the 22nd of each month");
  assert.equal(payDayLabel("month", 13), "on the 13th of each month");
  assert.equal(payDayLabel("month", 31), "on the 31st (or the month's last day)");
  assert.equal(payDayLabel("week", 5), "every Friday");
  assert.equal(rateUnit({ payEvery: "week", dayRate: true }), "a day");
  assert.equal(rateUnit({ payEvery: "month", dayRate: false }), "a month");
});
