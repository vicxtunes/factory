import assert from "node:assert/strict";
import { test } from "node:test";

import { toLinked, type ItemRow, type LinkRow } from "./progress";

const item = (o: Partial<ItemRow>): ItemRow => ({ product: "A4 prints", qty: 1, production_status: "not_started", stage: "factory", assigned_worker_id: null, ...o });
const row = (items: ItemRow[], cancelled = false): LinkRow => ({
  project: { id: "p1", title: "Grace wedding" },
  order: { id: "o1", order_no: "2026-0101", created_at: "2026-10-03T10:00:00Z", delivery_date: "2026-10-20", cancelled_at: cancelled ? "2026-10-04T10:00:00Z" : null, items },
});

test("an order is as far along as its slowest item, in the client's words", () => {
  const o = toLinked(row([item({ production_status: "ready_for_pickup" }), item({ product: "Photobook", production_status: "in_production" })]))!;
  assert.deepEqual([o.progress, o.finished, o.items.map((i) => i.progress)], ["Production", false, ["Ready for delivery", "Production"]]);
  assert.deepEqual([o.orderNo, o.projectTitle, o.deliveryDate], ["2026-0101", "Grace wedding", "2026-10-20"]);
});

test("received once a worker has it; designing counts as the same step as production", () => {
  assert.equal(toLinked(row([item({ assigned_worker_id: "w1" })]))!.progress, "Received");
  assert.equal(toLinked(row([item({ stage: "with_designer" }), item({ production_status: "in_production" })]))!.progress, "In Designing");
});

test("finished when every item is delivered; cancelled wins", () => {
  const done = toLinked(row([item({ production_status: "completed" }), item({ production_status: "completed" })]))!;
  assert.deepEqual([done.progress, done.finished], ["Delivered", true]);
  const cancelled = toLinked(row([item({ production_status: "completed" })], true))!;
  assert.deepEqual([cancelled.progress, cancelled.finished, cancelled.cancelled], ["Cancelled", false, true]);
});

test("no items yet reads as pending; a missing order or project is skipped", () => {
  assert.deepEqual([toLinked(row([]))!.progress, toLinked(row([]))!.finished], ["Pending", false]);
  assert.equal(toLinked({ project: null, order: row([]).order }), null);
});
