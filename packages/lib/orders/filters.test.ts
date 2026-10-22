import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrderItemWithOrder } from "@repo/lib/types";

import { emptyFilters, filterItems, kampalaDay } from "./filters";

// An order line as the board gets it: only what the date filter reads.
const line = (orderCreated: string, lineCreated: string) =>
  ({ id: lineCreated, created_at: lineCreated, production_status: "pending", order: { order_no: "2026-0001", client_name: "A", created_at: orderCreated, delivery_date: null } }) as unknown as OrderItemWithOrder;

test("a moment's day is Kampala's: 1am on the 22nd is the 22nd, though it's the 21st in UTC", () => {
  assert.equal(kampalaDay("2026-10-21T22:30:00Z"), "2026-10-22");
  assert.equal(kampalaDay("2026-10-22T20:59:00Z"), "2026-10-22");
  assert.equal(kampalaDay("2026-10-22T21:00:00Z"), "2026-10-23");
});

test("an order stays on the day it was created and submitted, even when a line is added later", () => {
  const items = [line("2026-10-20T07:00:00Z", "2026-10-22T09:00:00Z"), line("2026-10-22T08:00:00Z", "2026-10-22T08:00:00Z")];
  const on = (day: string) => filterItems(items, { ...emptyFilters(), dateField: "created", datePreset: "custom", dateFrom: day, dateTo: day }, new Map()).length;
  assert.equal(on("2026-10-20"), 1, "the order made on the 20th, though its line was added on the 22nd");
  assert.equal(on("2026-10-22"), 1, "only the order made on the 22nd");
});

test("a designer's order is dated the day they submitted it, not the day they started it", () => {
  const order = (created: string, submitted: string | null) =>
    ({ id: created, created_at: created, production_status: "pending", order: { order_no: "2026-0002", client_name: "B", created_at: created, submitted_at: submitted, delivery_date: null } }) as unknown as OrderItemWithOrder;
  const items = [order("2026-10-18T07:00:00Z", "2026-10-21T10:00:00Z"), order("2026-10-19T07:00:00Z", null)];
  const on = (day: string) => filterItems(items, { ...emptyFilters(), dateField: "created", datePreset: "custom", dateFrom: day, dateTo: day }, new Map()).length;
  assert.equal(on("2026-10-18"), 0, "not the day the designer started it");
  assert.equal(on("2026-10-21"), 1, "the day it was submitted");
  assert.equal(on("2026-10-19"), 1, "an order no designer submitted keeps its created day");
});
