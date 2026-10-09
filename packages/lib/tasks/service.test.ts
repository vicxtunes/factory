import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Task, TaskInput } from "./core";
import { TaskError, type TaskDirectory, type TaskStore } from "./ports";
import { TaskService } from "./service";

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

function fakes() {
  const rows: (Task & { tenantId: string })[] = [];
  const projects = new Map([["studio-a/wedding", { completed: false }], ["studio-a/old", { completed: true }]]);
  const members = new Map([["studio-a/joel", { archived: false }], ["studio-a/gone", { archived: true }]]);
  const mine = (s: TenantScope, id: string) => rows.find((r) => r.tenantId === s.tenantId && r.id === id);
  const store: TaskStore = {
    list: async (s, f) =>
      rows.filter(
        (r) => r.tenantId === s.tenantId && (!f.projectId || r.projectId === f.projectId) && (!f.assigneeId || r.assigneeId === f.assigneeId) && (!f.open || r.status !== "done"),
      ),
    get: async (s, id) => mine(s, id) ?? null,
    create: async (s, input) => {
      rows.push({ ...input, id: `t${rows.length + 1}`, tenantId: s.tenantId, projectTitle: "", assigneeName: null, status: "pending", doneAt: null });
      return `t${rows.length}`;
    },
    update: async (s, id, input) => !!(mine(s, id) && Object.assign(mine(s, id)!, input)),
    setStatus: async (s, id, status) => !!(mine(s, id) && Object.assign(mine(s, id)!, { status, doneAt: status === "done" ? "now" : null })),
    remove: async (s, id) => {
      const i = rows.findIndex((r) => r.tenantId === s.tenantId && r.id === id);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
  const directory: TaskDirectory = {
    project: async (s, id) => projects.get(`${s.tenantId}/${id}`) ?? null,
    member: async (s, id) => members.get(`${s.tenantId}/${id}`) ?? null,
  };
  return { service: new TaskService(store, directory), rows };
}

const cull: TaskInput = { projectId: "wedding", title: "Cull photos", assigneeId: "joel", dueOn: "2026-10-10", priority: "high" };

test("tasks go on projects in hand, to active team members", async () => {
  const { service } = fakes();
  await service.create(studioA, cull);
  await service.create(studioA, { ...cull, assigneeId: null, title: "Order album" });
  await assert.rejects(service.create(studioA, { ...cull, projectId: "old" }), /completed/);
  await assert.rejects(service.create(studioA, { ...cull, projectId: "nope" }), /no longer exists/);
  await assert.rejects(service.create(studioA, { ...cull, assigneeId: "gone" }), /archived/);
  assert.deepEqual((await service.forProject(studioA, "wedding")).map((t) => t.title), ["Cull photos", "Order album"]);
});

test("a task with a since-archived member can stay with them, but not move to one", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, cull);
  rows[0].assigneeId = "gone";
  await service.update(studioA, id, { ...cull, assigneeId: "gone", title: "Cull (round 2)" });
  const other = await service.create(studioA, { ...cull, assigneeId: null });
  await assert.rejects(service.update(studioA, other, { ...cull, assigneeId: "gone" }), /archived/);
});

test("done tasks leave the open list and can be reopened", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, cull);
  await service.setStatus(studioA, id, "done");
  assert.deepEqual(await service.open(studioA), []);
  await service.setStatus(studioA, id, "in_progress");
  assert.equal((await service.open(studioA, "joel")).length, 1);
});

test("one studio can't read, change, finish or remove another's task", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, cull);
  assert.deepEqual(await service.open(studioB), []);
  await assert.rejects(service.create(studioB, cull), /no longer exists/);
  await assert.rejects(service.update(studioB, id, cull), TaskError);
  await assert.rejects(service.setStatus(studioB, id, "done"), TaskError);
  await assert.rejects(service.remove(studioB, id), TaskError);
  assert.deepEqual([rows.length, rows[0].status], [1, "pending"]);
});

test("a team member moves only the tasks given to them", async () => {
  const { service, rows } = fakes();
  const theirs = await service.create(studioA, cull);
  const someoneElses = await service.create(studioA, { ...cull, assigneeId: null, title: "Order album" });
  await service.setStatus(studioA, theirs, "in_progress", "joel");
  assert.equal(rows[0].status, "in_progress");
  await assert.rejects(service.setStatus(studioA, someoneElses, "done", "joel"), /Only the person it's given to/);
  await service.setStatus(studioA, someoneElses, "done");
  assert.equal(rows[1].status, "done", "the owner, or Projects & tasks, moves any");
});
