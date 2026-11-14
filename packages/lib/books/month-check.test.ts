import assert from "node:assert/strict";
import { test } from "node:test";

import { dayTotals } from "./model";
import { addMonths, bookingsFor, difference, isMonthOpen, monthCheckReminder, monthEnd, monthName, monthTotals, notReady, reminderMonth, type MonthCheckLine } from "./month-check";

const line = (over: Partial<MonthCheckLine>): MonthCheckLine => ({
  accountId: "a",
  accountName: "Cash",
  opening: 0,
  moneyIn: 0,
  moneyOut: 0,
  dayCounts: 0,
  books: 100,
  actual: null,
  reason: null,
  enteredBy: null,
  bookedAs: null,
  ...over,
});

test("month dates: last day, next and previous months, name", () => {
  assert.equal(monthEnd("2026-11-01"), "2026-11-30");
  assert.equal(monthEnd("2028-02-01"), "2028-02-29");
  assert.equal(monthEnd("2026-12-01"), "2026-12-31");
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2027-01-01", -1), "2026-12-01");
  assert.equal(monthName("2026-11-01"), "November 2026");
});

test("a month opens at 20:00 on its last day", () => {
  assert.equal(isMonthOpen("2026-11-01", "2026-11-30", 19), false);
  assert.equal(isMonthOpen("2026-11-01", "2026-11-30", 20), true);
  assert.equal(isMonthOpen("2026-11-01", "2026-12-01", 0), true);
  assert.equal(isMonthOpen("2026-11-01", "2026-11-15", 23), false);
});

test("difference, bookings and what's missing before sending", () => {
  assert.equal(difference(line({ actual: null })), null);
  assert.equal(difference(line({ actual: 90 })), -10);
  assert.deepEqual(bookingsFor(-10), ["shortage", "opening"]);
  assert.deepEqual(bookingsFor(10), ["surplus", "opening"]);
  assert.equal(notReady([line({ actual: null })]), "Enter the real balance of every account.");
  assert.equal(notReady([line({ actual: 90, reason: "  " })]), "Say why each account that differs is different.");
  assert.equal(notReady([line({ actual: 90, reason: "Short" }), line({ actual: 100 })]), null);
  assert.deepEqual(monthTotals([line({ actual: 90 }), line({ actual: 130, books: 100 }), line({})]), { books: 300, actual: 220, difference: 20, differing: 2 });
});

test("reminder: the last day from 20:00, then the 1st and 3rd for last month, until approved", () => {
  assert.equal(reminderMonth("2026-11-30", 19), null);
  assert.equal(reminderMonth("2026-11-30", 20), "2026-11-01");
  assert.equal(reminderMonth("2026-12-01", 8), "2026-11-01");
  assert.equal(reminderMonth("2026-12-02", 8), null);
  assert.equal(reminderMonth("2026-12-03", 8), "2026-11-01");
  assert.equal(reminderMonth("2026-12-15", 8), null);
  assert.equal(monthCheckReminder("2026-11-01", "approved", "2026-12-01"), null);
  assert.match(monthCheckReminder("2026-11-01", "not_started", "2026-11-30")!.body, /^Tonight/);
  assert.match(monthCheckReminder("2026-11-01", "draft", "2026-12-03")!.body, /isn't done yet/);
  assert.match(monthCheckReminder("2026-11-01", "waiting", "2026-12-01")!.title, /waiting/);
});

test("a starting-balance fix isn't money in or out of the day", () => {
  assert.deepEqual(dayTotals([{ direction: "in", amount: 500, accountId: "m", kind: "opening_fix" }]), { moneyIn: 0, moneyOut: 0, net: 0, inNoAccount: 0 });
});
