import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Project, ProjectEvent, ProjectInput } from "./core";
import { ProjectError, type ProjectDirectory, type ProjectStore } from "./ports";
import { ProjectService } from "./service";

// The service against in-memory adapters that keep tenants apart and log
// history the way the real ones must.

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");
const owner = { name: "Amina" };

function fakes() {
  const rows: (Project & { tenantId: string })[] = [];
  const events: (ProjectEvent & { projectId: string })[] = [];
  const bookings = new Map([
    ["studio-a/confirmed", { customerId: "grace", title: "Grace & John wedding", date: "2026-12-12", status: "confirmed" }],
    ["studio-a/tentative", { customerId: "grace", title: "Maybe", date: "2026-12-13", status: "tentative" }],
  ]);
  const customers = new Map([["studio-a/grace", { archived: false }], ["studio-a/old", { archived: true }]]);
  const mine = (s: TenantScope, id: string) => rows.find((r) => r.tenantId === s.tenantId && r.id === id);
  const log = (projectId: string, kind: ProjectEvent["kind"], from: ProjectEvent["from"], to: ProjectEvent["to"], actorName: string) =>
    events.push({ id: `e${events.length}`, projectId, kind, from, to, actorName, at: `2026-10-03T10:00:${String(events.length).padStart(2, "0")}Z` });
  const store: ProjectStore = {
    list: async (s, f) => rows.filter((r) => r.tenantId === s.tenantId && (!f.customerId || r.customerId === f.customerId)),
    get: async (s, id) => mine(s, id) ?? null,
    events: async (s, id) => (mine(s, id) ? events.filter((e) => e.projectId === id) : []),
    idForBooking: async (s, b) => rows.find((r) => r.tenantId === s.tenantId && r.bookingId === b)?.id ?? null,
    create: async (s, input, actorName) => {
      if (input.bookingId && rows.some((r) => r.bookingId === input.bookingId)) throw new ProjectError("This booking already has a project.");
      const row = { ...input, id: `p${rows.length + 1}`, tenantId: s.tenantId, customerName: "", status: "booked" as const, createdAt: `2026-10-0${rows.length + 1}`, updatedAt: "" };
      rows.push(row);
      log(row.id, "created", null, "booked", actorName);
      return row.id;
    },
    update: async (s, id, input) => {
      const r = mine(s, id);
      if (r) Object.assign(r, input);
      return !!r;
    },
    setStatus: async (s, id, from, to, actorName) => {
      const r = mine(s, id);
      if (!r || r.status !== from) return false;
      r.status = to;
      log(id, "status", from, to, actorName);
      return true;
    },
  };
  const directory: ProjectDirectory = {
    customer: async (s, id) => customers.get(`${s.tenantId}/${id}`) ?? null,
    booking: async (s, id) => bookings.get(`${s.tenantId}/${id}`) ?? null,
  };
  return { service: new ProjectService(store, directory), rows };
}

const direct: ProjectInput = { customerId: "grace", title: "Family portraits", eventDate: null, notes: null, photosUrl: null };

test("start from a confirmed booking: copied, once, with its history", async () => {
  const { service } = fakes();
  await assert.rejects(service.startFromBooking(studioA, "tentative", owner), /Confirm the booking/);
  const id = await service.startFromBooking(studioA, "confirmed", owner);
  assert.equal(await service.startFromBooking(studioA, "confirmed", owner), id, "a second tap opens the same project");
  const view = await service.get(studioA, id);
  assert.deepEqual([view?.project.title, view?.project.eventDate, view?.project.bookingId, view?.project.status], ["Grace & John wedding", "2026-12-12", "confirmed", "booked"]);
  assert.deepEqual(view?.events.map((e) => [e.kind, e.to, e.actorName]), [["created", "booked", "Amina"]]);
});

test("moves along the pipeline are logged; back one step for revisions", async () => {
  const { service } = fakes();
  const id = await service.create(studioA, direct, owner);
  for (const to of ["in_progress", "editing", "review", "editing", "review", "delivered"] as const) await service.setStatus(studioA, id, to, owner);
  await assert.rejects(service.setStatus(studioA, id, "in_progress", owner), /back one step/);
  await service.setStatus(studioA, id, "completed", owner);
  await assert.rejects(service.setStatus(studioA, id, "delivered", owner), /completed/);
  await service.update(studioA, id, direct); // a completed project can still be corrected
  const history = (await service.get(studioA, id))?.events.map((e) => (e.kind === "created" ? "created" : `${e.from}→${e.to}`));
  assert.deepEqual(history, ["created", "booked→in_progress", "in_progress→editing", "editing→review", "review→editing", "editing→review", "review→delivered", "delivered→completed"]);
});

test("direct projects need an active client; a booked project's client stays", async () => {
  const { service } = fakes();
  await assert.rejects(service.create(studioA, { ...direct, customerId: "old" }, owner), /archived/);
  await assert.rejects(service.create(studioA, { ...direct, customerId: "nobody" }, owner), /no longer exists/);
  const booked = await service.startFromBooking(studioA, "confirmed", owner);
  await assert.rejects(service.update(studioA, booked, { ...direct, customerId: "someone" }), /client can't change/);
  await service.update(studioA, booked, { ...direct, title: "Renamed" });
});

test("active projects, by stage", async () => {
  const { service } = fakes();
  const a = await service.create(studioA, { ...direct, title: "A" }, owner);
  await service.create(studioA, { ...direct, title: "B" }, owner);
  const c = await service.create(studioA, { ...direct, title: "C" }, owner);
  await service.setStatus(studioA, a, "editing", owner);
  await service.setStatus(studioA, c, "completed", owner);
  assert.deepEqual((await service.active(studioA)).map((p) => p.title), ["B", "A"]);
});

test("one studio can't read, change or move another's project, even with its id", async () => {
  const { service, rows } = fakes();
  const id = await service.create(studioA, direct, owner);
  assert.equal(await service.get(studioB, id), null);
  assert.deepEqual(await service.list(studioB), []);
  await assert.rejects(service.update(studioB, id, direct), ProjectError);
  await assert.rejects(service.setStatus(studioB, id, "in_progress", owner), ProjectError);
  await assert.rejects(service.startFromBooking(studioB, "confirmed", owner), /no longer exists/);
  assert.equal(rows[0].status, "booked");
});
