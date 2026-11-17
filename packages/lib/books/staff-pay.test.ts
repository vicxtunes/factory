import assert from "node:assert/strict";
import { test } from "node:test";

import type { ExpenseLine } from "./expenses";
import { monthlyCost, payDaysBetween, payDayLabel, rateUnit, slipGross, slipState, weeksAhead, whenLabel, type StaffPayPerson, type StaffPaySlip } from "./staff-pay";

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

test("when an allowance or advance falls, in words", () => {
  assert.equal(whenLabel(null), "with every pay");
  assert.equal(whenLabel([0, 1, 2, 3, 4, 5, 6]), "every day");
  assert.equal(whenLabel([5]), "every Friday");
  assert.equal(whenLabel([5, 1, 3]), "Mon, Wed, Fri");
  assert.equal(whenLabel([0, 6]), "Sat, Sun");
});

const person = (patch: Partial<StaffPayPerson> = {}): StaffPayPerson => ({
  id: "p",
  name: "Eddy",
  workerId: null,
  profileId: null,
  designerId: null,
  roles: [],
  payEvery: "month",
  dayRate: false,
  rate: 300000,
  payDay: 28,
  nextPayOn: "2026-11-28",
  phone: null,
  sendsItself: false,
  regulars: [],
  extras: [],
  advanceOwed: 0,
  stopped: false,
  ...patch,
});

test("pay days between two dates, the 31st on a short month's last day", () => {
  assert.deepEqual(payDaysBetween(person(), "2026-11-17", "2026-12-31"), ["2026-11-28", "2026-12-28"]);
  assert.deepEqual(payDaysBetween(person({ payDay: 31, nextPayOn: "2026-11-30" }), "2026-11-17", "2026-12-31"), ["2026-11-30", "2026-12-31"]);
  assert.deepEqual(payDaysBetween(person({ payEvery: "week", payDay: 5, nextPayOn: "2026-11-20" }), "2026-11-17", "2026-11-30"), ["2026-11-20", "2026-11-27"]);
  // Not before the next pay day the person has.
  assert.deepEqual(payDaysBetween(person({ nextPayOn: "2026-12-28" }), "2026-11-17", "2026-12-31"), ["2026-12-28"]);
});

test("the next four weeks: payslips with their allowances, and what's given on its day", () => {
  // Tue 17 Nov 2026. Weeks: 17–23, 24–30, 1–7 Dec, 8–14 Dec.
  const p = person({
    extras: [{ id: "x", name: "Overtime", amount: 20000 }],
    regulars: [
      { id: "a", kind: "allowance", name: "Transport", amount: 50000, weekdays: null, how: "payslip", startsOn: "2026-11-01" },
      { id: "b", kind: "advance", name: "Advance", amount: 10000, weekdays: [5], how: "send", startsOn: "2026-11-18" },
      { id: "c", kind: "allowance", name: "Lunch", amount: 5000, weekdays: [1, 2, 3, 4, 5], how: "hand", startsOn: "2026-11-18" },
    ],
  });
  const weeks = weeksAhead([p], new Map(), "2026-11-17", []);
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks[0], { from: "2026-11-17", to: "2026-11-23", pay: 0, allowances: 4 * 5000, advances: 10000 });
  assert.deepEqual(weeks[1], { from: "2026-11-24", to: "2026-11-30", pay: 300000 + 50000 + 20000, allowances: 5 * 5000, advances: 10000 });
  assert.equal(weeks[2].pay, 0);
  // A stopped person needs nothing.
  assert.equal(weeksAhead([person({ stopped: true })], new Map(), "2026-11-17", []).reduce((s, w) => s + w.pay, 0), 0);
});

test("a payslip already made counts at what's left to pay on it", () => {
  const slip = {
    id: "s",
    personId: "p",
    payOn: "2026-11-25",
    rate: 300000,
    dayRate: false,
    days: null,
    basic: 300000,
    allowances: [],
    advance: 100000,
    net: 200000,
    expense: { amount: 200000, paid: 50000, voidedAt: null, payoutSending: false },
  } as unknown as StaffPaySlip;
  // Their next pay day moved on to 25 Dec once the payslip was made.
  const weeks = weeksAhead([person({ nextPayOn: "2026-12-25" })], new Map(), "2026-11-17", [slip]);
  assert.equal(weeks[1].pay, 150000);
  assert.equal(weeks.reduce((s, w) => s + w.pay, 0), 150000);
  // Paid, or outside the four weeks: nothing.
  const paid = { ...slip, expense: { ...slip.expense, paid: 200000 } } as StaffPaySlip;
  assert.equal(weeksAhead([], new Map(), "2026-11-17", [paid]).reduce((s, w) => s + w.pay, 0), 0);
});

test("a day rate's payslip is estimated from its last days; daily payslip allowances count their days", () => {
  const p = person({
    dayRate: true,
    payEvery: "week",
    payDay: 6,
    rate: 15000,
    nextPayOn: "2026-11-21",
    regulars: [{ id: "l", kind: "allowance", name: "Lunch", amount: 3000, weekdays: [1, 2, 3, 4, 5, 6], how: "payslip", startsOn: "2026-11-01" }],
  });
  const weeks = weeksAhead([p], new Map([["p", 6]]), "2026-11-17", []);
  // Sat 21 Nov: 6 days × 15,000 + 6 lunches (15–21 Nov, Mon–Sat).
  assert.equal(weeks[0].pay, 6 * 15000 + 6 * 3000);
  assert.equal(weeks[1].pay, 6 * 15000 + 6 * 3000);
});

test("a month's cost at today's settings", () => {
  assert.equal(monthlyCost(person(), 26), 300000);
  assert.equal(monthlyCost(person({ regulars: [{ id: "a", kind: "allowance", name: "Lunch", amount: 3000, weekdays: [1, 2, 3, 4, 5, 6], how: "hand", startsOn: "2026-11-01" }] }), 26), 300000 + Math.round(3000 * 6 * (52 / 12)));
  assert.equal(monthlyCost(person({ payEvery: "week", rate: 70000 }), 26), Math.round(70000 * (52 / 12)));
  assert.equal(monthlyCost(person({ dayRate: true, rate: 15000 }), 24), 360000);
  // Advances aren't a cost: they come off pay.
  assert.equal(monthlyCost(person({ regulars: [{ id: "b", kind: "advance", name: "Advance", amount: 10000, weekdays: [5], how: "send", startsOn: "2026-11-01" }] }), 26), 300000);
});
