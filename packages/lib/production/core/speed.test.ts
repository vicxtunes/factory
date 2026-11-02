import assert from "node:assert/strict";
import { test } from "node:test";

import { formatHours, lateness, leadHours, speedFigures, stageHours, type ItemJourney } from "./index";

const dayOf = (iso: string) => iso.slice(0, 10);

const j = (over: Partial<ItemJourney>): ItemJourney => ({
  itemId: "i",
  orderNo: "2026-1",
  clientName: "Grace",
  productId: "book",
  product: "Photo book",
  workerName: "Tom",
  placedAt: "2026-10-01T08:00:00Z",
  releasedAt: "2026-10-01T10:00:00Z",
  toFactoryAt: null,
  inProductionAt: "2026-10-02T08:00:00Z",
  checkAt: "2026-10-02T14:00:00Z",
  readyAt: "2026-10-02T16:00:00Z",
  dueOn: "2026-10-03",
  ...over,
});

test("each stage's length, and order to ready", () => {
  const item = j({});
  assert.deepEqual(stageHours(item), { receiving: 2, waiting: 22, making: 6, checking: 2 });
  assert.equal(leadHours(item), 32);
  // Through a designer: waiting starts when it reached the factory.
  assert.deepEqual(stageHours(j({ toFactoryAt: "2026-10-01T20:00:00Z" })), { receiving: 2, designing: 10, waiting: 12, making: 6, checking: 2 });
  assert.equal(leadHours(j({ readyAt: null })), null, "not ready: no lead time yet");
});

test("late: ready after the due date, or still open past it", () => {
  assert.equal(lateness(j({}), "2026-10-05", dayOf), "on_time");
  assert.equal(lateness(j({ readyAt: "2026-10-04T09:00:00Z" }), "2026-10-05", dayOf), "late");
  assert.equal(lateness(j({ readyAt: null }), "2026-10-05", dayOf), "late_open");
  assert.equal(lateness(j({ readyAt: null }), "2026-10-03", dayOf), "open", "due today isn't late yet");
  assert.equal(lateness(j({ dueOn: null }), "2026-10-05", dayOf), "no_date");
});

test("the figures: medians, on time, what to chase, by product and by worker", () => {
  const f = speedFigures(
    [
      j({ itemId: "a" }),
      j({ itemId: "b", readyAt: "2026-10-04T16:00:00Z" }),
      j({ itemId: "c", productId: "frame", product: "Frame", workerName: "Ann", readyAt: null, checkAt: null, dueOn: "2026-10-02" }),
    ],
    "2026-10-05",
    dayOf,
  );
  assert.equal(f.done, 2);
  assert.equal(f.leadMedian, (32 + 80) / 2);
  assert.equal(f.onTimePercent, 50);
  assert.equal(f.late, 1);
  assert.deepEqual(f.lateNow.map((x) => x.itemId), ["c"]);
  assert.equal(f.stages.find((s) => s.key === "making")?.median, 6);
  const frame = f.products.find((p) => p.name === "Frame");
  assert.deepEqual([frame?.done, frame?.late, frame?.leadMedian], [0, 1, null]);
  assert.deepEqual(f.weeks, [{ week: "2026-09-28", leadMedian: 56, done: 2 }]);
});

test("durations read plainly", () => {
  assert.equal(formatHours(0.5), "30 min");
  assert.equal(formatHours(6), "6 h");
  assert.equal(formatHours(60), "2.5 days");
  assert.equal(formatHours(null), "—");
});
