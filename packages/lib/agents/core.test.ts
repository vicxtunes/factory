import assert from "node:assert/strict";
import { test } from "node:test";

import { agentFigures, agentStage, isFinalStage, payBeforeProduction, payFirstWording, weeklyPayAmount, weeklyPayDue, weeklyPaySchema, weeklyPayWhen } from "./core";

const line = (production_status: Parameters<typeof agentStage>[0]["lines"][number]["production_status"], stage: "factory" | "with_designer" = "factory") => ({ production_status, stage });
const approved = (...lines: ReturnType<typeof line>[]) => agentStage({ cancelled_at: null, approval_status: "approved", lines });

test("an order waiting for reception is submitted", () => {
  assert.equal(agentStage({ cancelled_at: null, approval_status: "pending_review", lines: [line("not_started")] }), "submitted");
});

test("received and not started is confirmed", () => {
  assert.equal(approved(line("not_started")), "confirmed");
});

test("with the designer, in production or in quality check is processing", () => {
  assert.equal(approved(line("not_started", "with_designer")), "processing");
  assert.equal(approved(line("in_production")), "processing");
  assert.equal(approved(line("quality_check")), "processing");
});

test("ready for pickup is completed, handed over is delivered", () => {
  assert.equal(approved(line("ready_for_pickup")), "completed");
  assert.equal(approved(line("completed")), "delivered");
});

test("an order shows its least advanced line", () => {
  assert.equal(approved(line("completed"), line("in_production")), "processing");
  assert.equal(approved(line("completed"), line("ready_for_pickup")), "completed");
  assert.equal(approved(line("completed"), line("not_started")), "confirmed");
});

test("cancelled wins over everything", () => {
  assert.equal(agentStage({ cancelled_at: "2026-11-04", approval_status: "approved", lines: [line("completed")] }), "cancelled");
});

test("delivered and cancelled are final", () => {
  assert.equal(isFinalStage("delivered"), true);
  assert.equal(isFinalStage("cancelled"), true);
  assert.equal(isFinalStage("processing"), false);
  assert.equal(isFinalStage(null), false);
});

test("figures: cancelled orders count in the total only, pending commission only while pending", () => {
  const figures = agentFigures({
    stages: ["delivered", "processing", "submitted", "cancelled"],
    commissions: [
      { status: "credited", amount: 1000, credited_amount: 900 },
      { status: "pending", amount: 500, credited_amount: 0 },
      { status: "reversed", amount: 700, credited_amount: 0 },
      { status: "cancelled", amount: 300, credited_amount: 0 },
    ],
    balance: 400,
    withdrawn: 500,
  });
  assert.deepEqual(figures, { totalOrders: 4, completedSales: 1, pendingOrders: 2, commissionEarned: 900, commissionPending: 500, balance: 400, withdrawn: 500 });
});

test("pay before production uses the boss's %, rounded up", () => {
  assert.equal(payBeforeProduction(100_001, 80), 80_001);
  assert.equal(payBeforeProduction(100_000, 50), 50_000);
  assert.equal(payBeforeProduction(100_000, 0), 0);
});

test("at 0% nothing is said about paying first", () => {
  const money = (n: number) => `UGX ${n}`;
  assert.equal(payFirstWording(1000, 0, money), null);
  assert.equal(payFirstWording(1000, 60, money), "Production starts once 60% of the price (UGX 600) is paid.");
  assert.equal(payFirstWording(null, 60, money), "Production starts once 60% of the price is paid.");
});

const monday10 = { on: true, day: 1, hour: 10, min: 5000 };

test("weekly pay is due on its day from its hour, Kampala time, and only that day", () => {
  // 2026-11-16 is a Monday; Kampala is UTC+3.
  assert.equal(weeklyPayDue(monday10, new Date("2026-11-16T06:59:00Z")), null);
  assert.equal(weeklyPayDue(monday10, new Date("2026-11-16T07:00:00Z")), "2026-11-16");
  assert.equal(weeklyPayDue(monday10, new Date("2026-11-16T20:59:00Z")), "2026-11-16");
  // Monday 23:59 UTC is already Tuesday in Kampala.
  assert.equal(weeklyPayDue(monday10, new Date("2026-11-16T21:00:00Z")), null);
  assert.equal(weeklyPayDue(monday10, new Date("2026-11-17T09:00:00Z")), null);
  assert.equal(weeklyPayDue({ ...monday10, on: false }, new Date("2026-11-16T09:00:00Z")), null);
  assert.equal(weeklyPayDue({ ...monday10, day: 7, hour: 8 }, new Date("2026-11-22T05:00:00Z")), "2026-11-22");
});

test("weekly pay sends the balance less this week's commission, capped, and nothing under the smallest amount", () => {
  assert.equal(weeklyPayAmount(42_500, 0, 5000, 5_000_000), 42_500);
  assert.equal(weeklyPayAmount(42_500, 30_000, 5000, 5_000_000), 12_500);
  assert.equal(weeklyPayAmount(42_500, 40_000, 5000, 5_000_000), 0);
  assert.equal(weeklyPayAmount(4_999, 0, 5000, 5_000_000), 0);
  assert.equal(weeklyPayAmount(-3_000, 0, 5000, 5_000_000), 0);
  assert.equal(weeklyPayAmount(7_000_000, 0, 5000, 5_000_000), 5_000_000);
});

test("weekly pay setting: a day, an hour from 08 to 20, a smallest amount from 500", () => {
  assert.deepEqual(weeklyPaySchema.parse({ on: true, day: "5", hour: "14", min: "10000" }), { on: true, day: 5, hour: 14, min: 10000 });
  assert.equal(weeklyPaySchema.safeParse({ on: true, day: 8, hour: 10, min: 5000 }).success, false);
  assert.equal(weeklyPaySchema.safeParse({ on: true, day: 1, hour: 21, min: 5000 }).success, false);
  assert.equal(weeklyPaySchema.safeParse({ on: true, day: 1, hour: 10, min: 100 }).success, false);
  assert.equal(weeklyPayWhen({ day: 5, hour: 9 }), "Every Friday from 09:00");
});
