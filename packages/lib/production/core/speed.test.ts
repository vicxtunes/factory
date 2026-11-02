import assert from "node:assert/strict";
import { test } from "node:test";

import { arrivals, formatHours, itemFlow, lateness, leadHours, speedFigures, stageHours, type ItemJourney } from "./index";

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

test("orders arrive by weekday and hour, each order once", () => {
  const grid = arrivals(
    [j({ itemId: "a", orderNo: "1" }), j({ itemId: "b", orderNo: "1" }), j({ itemId: "c", orderNo: "2", placedAt: "2026-10-02T15:30:00Z" })],
    (iso) => ({ weekday: (new Date(iso).getUTCDay() + 6) % 7, hour: new Date(iso).getUTCHours() }),
  );
  // 1 Oct 2026 is a Thursday (3), 2 Oct a Friday (4).
  assert.equal(grid[3][8], 1);
  assert.equal(grid[4][15], 1);
  assert.equal(grid.flat().reduce((a, b) => a + b, 0), 2);
});

test("the flow: designer or straight, then each step or stuck before it; a jumped status still counts", () => {
  const links = itemFlow([
    j({ itemId: "done" }),
    j({ itemId: "designed", toFactoryAt: "2026-10-01T20:00:00Z", inProductionAt: null, checkAt: null, readyAt: null }),
    j({ itemId: "jumped", inProductionAt: null, checkAt: null }),
    j({ itemId: "new", releasedAt: null, inProductionAt: null, checkAt: null, readyAt: null }),
  ]);
  const get = (from: string, to: string) => links.find((l) => l.from === from && l.to === to)?.items ?? 0;
  assert.equal(get("Ordered", "Straight to factory"), 2);
  assert.equal(get("Ordered", "Designer"), 1);
  assert.equal(get("Ordered", "Not released yet"), 1);
  assert.equal(get("Designer", "Still waiting to start"), 1);
  assert.equal(get("Quality check", "Ready"), 2);
});
