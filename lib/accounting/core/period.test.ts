import assert from "node:assert/strict";
import { test } from "node:test";

import { addDays, inPeriod, lastMonths, localDate, resolvePeriod, startOfLocalDay } from "./period";

const KAMPALA = "Africa/Kampala"; // UTC+3, no DST

test("local date follows the tenant's zone, not UTC", () => {
  // 22:30 UTC on 30 Sep is already 1 Oct in Kampala.
  assert.equal(localDate("2026-09-30T22:30:00Z", KAMPALA), "2026-10-01");
  assert.equal(localDate("2026-09-30T20:59:59Z", KAMPALA), "2026-09-30");
});

test("a local day starts at local midnight", () => {
  assert.equal(startOfLocalDay("2026-10-01", KAMPALA).toISOString(), "2026-09-30T21:00:00.000Z");
});

test("start of day is right across a DST change", () => {
  // London springs forward on 29 Mar 2026; midnight is still GMT (UTC+0).
  assert.equal(startOfLocalDay("2026-03-29", "Europe/London").toISOString(), "2026-03-29T00:00:00.000Z");
  // The next day midnight is BST (UTC+1).
  assert.equal(startOfLocalDay("2026-03-30", "Europe/London").toISOString(), "2026-03-29T23:00:00.000Z");
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

const NOW = new Date("2026-10-15T09:00:00Z");

test("this month runs from the 1st, local, up to the end of today", () => {
  const p = resolvePeriod({ preset: "this_month" }, NOW, KAMPALA);
  assert.equal(p.fromDate, "2026-10-01");
  assert.equal(p.toDate, "2026-10-15");
  assert.equal(p.from, "2026-09-30T21:00:00.000Z");
  assert.equal(p.to, "2026-10-15T21:00:00.000Z");
});

test("last month is the whole previous month, including across a year", () => {
  const p = resolvePeriod({ preset: "last_month" }, NOW, KAMPALA);
  assert.deepEqual([p.fromDate, p.toDate], ["2026-09-01", "2026-09-30"]);
  const jan = resolvePeriod({ preset: "last_month" }, new Date("2026-01-10T09:00:00Z"), KAMPALA);
  assert.deepEqual([jan.fromDate, jan.toDate], ["2025-12-01", "2025-12-31"]);
});

test("this year starts on 1 January", () => {
  const p = resolvePeriod({ preset: "this_year" }, NOW, KAMPALA);
  assert.deepEqual([p.fromDate, p.toDate], ["2026-01-01", "2026-10-15"]);
});

test("all time is unbounded", () => {
  const p = resolvePeriod({ preset: "all" }, NOW, KAMPALA);
  assert.equal(p.from, null);
  assert.equal(p.to, null);
  assert.ok(inPeriod("2001-01-01T00:00:00Z", p));
});

test("custom ranges are inclusive of both dates", () => {
  const p = resolvePeriod({ preset: "custom", from: "2026-09-10", to: "2026-09-12" }, NOW, KAMPALA);
  assert.equal(p.preset, "custom");
  assert.ok(inPeriod("2026-09-09T21:00:00Z", p)); // 10 Sep 00:00 local
  assert.ok(inPeriod("2026-09-12T20:59:59Z", p)); // 12 Sep 23:59:59 local
  assert.ok(!inPeriod("2026-09-12T21:00:00Z", p)); // 13 Sep local
  assert.ok(!inPeriod("2026-09-09T20:59:59Z", p));
});

test("bad or reversed custom ranges fall back to this month", () => {
  assert.equal(resolvePeriod({ preset: "custom", from: "2026-09-12", to: "2026-09-10" }, NOW, KAMPALA).preset, "this_month");
  assert.equal(resolvePeriod({ preset: "custom", from: "junk", to: "2026-09-10" }, NOW, KAMPALA).preset, "this_month");
  assert.equal(resolvePeriod({ preset: "nonsense" }, NOW, KAMPALA).preset, "this_month");
  assert.equal(resolvePeriod({}, NOW, KAMPALA).preset, "this_month");
});

test("last months are oldest first and cross the year", () => {
  assert.deepEqual(lastMonths(new Date("2026-02-10T09:00:00Z"), 4, KAMPALA), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});
