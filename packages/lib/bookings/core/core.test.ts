import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { addDays, addMonths, bookingInputSchema, byTime, canEditBooking, canMoveBooking, clashes, daysBetween, startOfWeek, stepAnchor, viewRange } from "./index";

test("calendar day maths", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(startOfWeek("2026-10-03"), "2026-09-28", "a Saturday's week starts the Monday before");
  assert.equal(startOfWeek("2026-09-28"), "2026-09-28");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-01", "months step from the 1st, never overflow");
  assert.equal(addMonths("2026-01-15", -1), "2025-12-01");
  assert.equal(daysBetween("2026-10-30", "2026-11-02").length, 4);
});

test("each view's days", () => {
  assert.deepEqual(viewRange("day", "2026-10-03"), { from: "2026-10-03", to: "2026-10-03" });
  assert.deepEqual(viewRange("week", "2026-10-03"), { from: "2026-09-28", to: "2026-10-04" });
  // October 2026 starts on a Thursday and ends on a Saturday: whole weeks around it.
  assert.deepEqual(viewRange("month", "2026-10-17"), { from: "2026-09-28", to: "2026-11-01" });
  assert.equal(daysBetween(viewRange("month", "2026-10-17").from, viewRange("month", "2026-10-17").to).length % 7, 0);
  assert.deepEqual(viewRange("list", "2026-10-03"), { from: "2026-10-03", to: "2026-12-01" });
  assert.equal(stepAnchor("month", "2026-10-17", 1), "2026-11-01");
  assert.equal(stepAnchor("week", "2026-10-03", -1), "2026-09-26");
});

const at = (id: string, date: string, startTime: string | null, endTime: string | null, status = "confirmed" as const) => ({ id, date, startTime, endTime, status });

test("clashes: same day, overlapping times, neither cancelled", () => {
  assert.equal(clashes(at("a", "2026-10-03", "10:00", "12:00"), at("b", "2026-10-03", "11:00", "13:00")), true);
  assert.equal(clashes(at("a", "2026-10-03", "10:00", "12:00"), at("b", "2026-10-03", "12:00", "14:00")), false, "touching ends");
  assert.equal(clashes(at("a", "2026-10-03", null, null), at("b", "2026-10-03", "08:00", "09:00")), true, "all day overlaps everything");
  assert.equal(clashes(at("a", "2026-10-03", "10:00", "12:00"), at("b", "2026-10-04", "10:00", "12:00")), false);
  assert.equal(clashes(at("a", "2026-10-03", null, null), { ...at("b", "2026-10-03", null, null), status: "cancelled" }), false);
  assert.equal(clashes(at("a", "2026-10-03", null, null), at("a", "2026-10-03", null, null)), false, "not with itself");
});

test("ordering: day, then all-day first, then start time", () => {
  const list = [at("c", "2026-10-03", "14:00", "15:00"), at("b", "2026-10-03", null, null), at("a", "2026-10-02", "18:00", "19:00")];
  assert.deepEqual(list.sort(byTime).map((b) => b.id), ["a", "b", "c"]);
});

test("status moves", () => {
  assert.equal(canMoveBooking("tentative", "confirmed"), true);
  assert.equal(canMoveBooking("tentative", "completed"), false, "confirm first");
  assert.equal(canMoveBooking("confirmed", "completed"), true);
  assert.equal(canMoveBooking("completed", "cancelled"), false, "completed is final");
  assert.equal(canMoveBooking("cancelled", "tentative"), true, "reopen");
  assert.deepEqual(["tentative", "confirmed", "completed", "cancelled"].map((s) => canEditBooking(s as never)), [true, true, false, false]);
});

const input = {
  customerId: "7d3c9a51-2f3e-4f5b-9a1c-0e8b2d4c6f10",
  title: " Grace & John wedding ",
  date: "2026-12-12",
  startTime: "10:00",
  endTime: "18:00",
  location: "Speke Resort",
  packageName: "Wedding Gold",
  amount: 2_500_000,
  notes: "",
  quotationId: null,
};

test("booking input", () => {
  const b = parseInput(bookingInputSchema, input);
  assert.deepEqual([b.title, b.notes], ["Grace & John wedding", null]);
  assert.equal(parseInput(bookingInputSchema, { ...input, startTime: null, endTime: null }).startTime, null);
  assert.throws(() => parseInput(bookingInputSchema, { ...input, endTime: null }), /both a start and an end time/);
  assert.throws(() => parseInput(bookingInputSchema, { ...input, endTime: "09:00" }), /end time must be after/);
  assert.throws(() => parseInput(bookingInputSchema, { ...input, startTime: "10am" }), /like 14:00/);
  assert.throws(() => parseInput(bookingInputSchema, { ...input, date: "12/12/2026" }), /valid date/);
  assert.throws(() => parseInput(bookingInputSchema, { ...input, title: " " }), /title/);
});
