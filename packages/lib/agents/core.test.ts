import assert from "node:assert/strict";
import { test } from "node:test";

import { agentFigures, agentStage, isFinalStage } from "./core";

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
