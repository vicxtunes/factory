import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInput } from "@repo/lib/kernel/core";

import { byUrgency, isOverdue, taskInputSchema, type Task } from "./index";

const task = (o: Partial<Task>): Task => ({
  id: "t",
  projectId: "p",
  projectTitle: "",
  title: "x",
  assigneeId: null,
  assigneeName: null,
  customerId: null,
  customerName: null,
  shareToken: null,
  kind: "todo",
  folderId: null,
  pickMin: null,
  pickMax: null,
  dueOn: null,
  priority: "normal",
  status: "pending",
  doneAt: null,
  ...o,
});

test("overdue: not done and past its day", () => {
  assert.equal(isOverdue(task({ dueOn: "2026-10-02" }), "2026-10-03"), true);
  assert.equal(isOverdue(task({ dueOn: "2026-10-03" }), "2026-10-03"), false, "due today isn't late yet");
  assert.equal(isOverdue(task({ dueOn: "2026-10-02", status: "done" }), "2026-10-03"), false);
  assert.equal(isOverdue(task({}), "2026-10-03"), false);
});

test("urgency: open first, soonest due, highest priority, then title", () => {
  const list = [
    task({ title: "done", status: "done", dueOn: "2026-01-01" }),
    task({ title: "no date" }),
    task({ title: "later", dueOn: "2026-10-09" }),
    task({ title: "soon low", dueOn: "2026-10-05", priority: "low" }),
    task({ title: "soon high", dueOn: "2026-10-05", priority: "high" }),
  ];
  assert.deepEqual(list.sort(byUrgency).map((t) => t.title), ["soon high", "soon low", "later", "no date", "done"]);
});

test("task input", () => {
  const ok = { projectId: "7d3c9a51-2f3e-4f5b-9a1c-0e8b2d4c6f10", title: " Cull photos ", assigneeId: null, dueOn: null, priority: "high" };
  assert.equal(parseInput(taskInputSchema, ok).title, "Cull photos");
  assert.throws(() => parseInput(taskInputSchema, { ...ok, priority: "urgent" }), /priority/);
  assert.throws(() => parseInput(taskInputSchema, { ...ok, assigneeId: "joel" }), /from the team/);
  assert.throws(() => parseInput(taskInputSchema, { ...ok, title: "" }), /Describe the task/);
});

test("a task for a client, or to choose or give feedback, says enough", () => {
  const base = { projectId: "0b6c1d5e-0000-4000-8000-000000000001", title: "Choose your album photos", assigneeId: null, dueOn: null, priority: "normal" };
  const client = "0b6c1d5e-0000-4000-8000-000000000002";
  const folder = "0b6c1d5e-0000-4000-8000-000000000003";
  // Old callers send none of the new fields: a to-do for nobody in particular.
  assert.deepEqual(parseInput(taskInputSchema, base), { ...base, customerId: null, kind: "todo", folderId: null, pickMin: null, pickMax: null });
  const choose = parseInput(taskInputSchema, { ...base, customerId: client, kind: "choose", folderId: folder, pickMin: 30, pickMax: 40 });
  assert.deepEqual([choose.kind, choose.pickMin, choose.pickMax], ["choose", 30, 40]);
  // Picks only belong to choosing.
  assert.deepEqual(parseInput(taskInputSchema, { ...base, kind: "feedback", folderId: folder, pickMax: 5 }).pickMax, null);
  assert.throws(() => parseInput(taskInputSchema, { ...base, kind: "choose", folderId: folder }), /how many photos/);
  assert.throws(() => parseInput(taskInputSchema, { ...base, kind: "feedback" }), /Choose the folder/);
  assert.throws(() => parseInput(taskInputSchema, { ...base, kind: "name" }), /Choose the folder/);
  assert.equal(parseInput(taskInputSchema, { ...base, customerId: client, kind: "name", folderId: folder }).kind, "name");
  assert.throws(() => parseInput(taskInputSchema, { ...base, kind: "choose", folderId: folder, pickMin: 5, pickMax: 2 }), /least can't be more/);
  assert.throws(() => parseInput(taskInputSchema, { ...base, assigneeId: client, customerId: client }), /not both/);
});
