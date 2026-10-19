import assert from "node:assert/strict";
import { test } from "node:test";

import type { JobView, VendorJob } from "./core";
import { VendorJobService } from "./jobs";
import { VendorError, type VendorJobStore } from "./ports";
import { memoryStore } from "./testing";
import { VendorService } from "./service";

// The job service against in-memory stores: who may move a job, when, and who's told.

function memoryJobs(vendorsById: (id: string) => Promise<{ name: string; category: string; clientId: string } | null>) {
  const rows = new Map<string, VendorJob>();
  const paid: string[] = [];
  const view = async (job: VendorJob): Promise<JobView> => {
    const vendor = (await vendorsById(job.vendorId))!;
    return { ...job, vendor: { ...vendor, photoKey: null }, studio: { name: "Lens & Light", ownerClientId: "c-owner" }, projectTitle: "Wedding" };
  };
  const store: VendorJobStore = {
    create: async (tenantId, request, requestedByName) => {
      if ([...rows.values()].some((j) => j.projectId === request.projectId && j.vendorId === request.vendorId && ["requested", "accepted", "delivered"].includes(j.status))) {
        throw new VendorError("This vendor already has a job open on this project.");
      }
      const job: VendorJob = { id: `j${rows.size + 1}`, tenantId, ...request, status: "requested", fee: null, requestedByName, createdAt: "2026-10-19T00:00:00Z" };
      rows.set(job.id, job);
      return job;
    },
    get: async (id) => (rows.has(id) ? view(rows.get(id)!) : null),
    forVendor: async (vendorId) => Promise.all([...rows.values()].filter((j) => j.vendorId === vendorId).map(view)),
    forProject: async (tenantId, projectId) => Promise.all([...rows.values()].filter((j) => j.tenantId === tenantId && j.projectId === projectId).map(view)),
    move: async (id, from, to) => {
      const job = rows.get(id);
      if (!job || !from.includes(job.status)) return null;
      const moved = { ...job, status: to };
      rows.set(id, moved);
      return moved;
    },
    pay: async (tenantId, id) => {
      const job = rows.get(id)!;
      if (job.status !== "delivered") throw new VendorError("Only delivered work can be paid.");
      rows.set(id, { ...job, status: "paid", fee: 0 });
      paid.push(id);
    },
  };
  return { store, rows, paid };
}

async function setUp() {
  const { store: vendorStore } = memoryStore();
  const vendors = new VendorService(vendorStore, {} as never, () => "x");
  const kato = await vendors.join({ clientId: "c-kato", name: "Kato" }, { kind: "individual", businessName: null, category: "photo_editor", skills: ["Culling"], socials: {} });
  const { store, rows, paid } = memoryJobs(async (id) => vendorStore.get(id));
  const told: { to: string; title: string }[] = [];
  const service = new VendorJobService(store, vendorStore, { notify: async (to, m) => void told.push({ to, title: m.title }) });
  const studio = { tenantId: "t-lens", name: "Lens & Light", actorName: "Amina" };
  const request = { projectId: "p-wedding", vendorId: kato.id, brief: "Edit 300 photos", dueOn: null, price: 300_000 };
  return { service, kato, rows, paid, told, studio, request };
}

test("a job from request to paid, each side told", async () => {
  const { service, rows, paid, told, studio, request } = await setUp();
  await service.request(studio, request);
  const [id] = [...rows.keys()];
  assert.deepEqual(told.at(-1), { to: "c-kato", title: "Job request from Lens & Light" });

  await assert.rejects(service.deliver("c-kato", id!), /in progress/, "not before accepting");
  await service.respond("c-kato", id!, true);
  assert.deepEqual(told.at(-1), { to: "c-owner", title: "Kato accepted a job" });
  await assert.rejects(service.pay("t-lens", id!, { id: "c-owner", name: "Amina" }), /delivered/, "not before it's delivered");

  await service.deliver("c-kato", id!);
  await service.pay("t-lens", id!, { id: "c-owner", name: "Amina" });
  assert.deepEqual(paid, [id]);
  assert.equal(rows.get(id!)!.status, "paid");
  assert.equal(told.at(-1)!.title, "Lens & Light paid you");
});

test("only the job's own vendor answers it, and only its own studio cancels or pays it", async () => {
  const { service, rows, studio, request } = await setUp();
  await service.request(studio, request);
  const [id] = [...rows.keys()];
  await assert.rejects(service.respond("c-someone-else", id!, true), /doesn't exist/);
  await assert.rejects(service.cancel("t-other-studio", id!), /doesn't exist/);
  assert.equal(await service.vendorJob("c-someone-else", id!), null);

  await service.respond("c-kato", id!, false);
  await assert.rejects(service.respond("c-kato", id!, true), /answered or called off/, "a declined request stays declined");
  await assert.rejects(service.cancel("t-lens", id!), /can't be cancelled/);
});

test("one open job per vendor on a project; another once it's over; no requests to a suspended vendor", async () => {
  const { service, rows, studio, request, kato } = await setUp();
  await service.request(studio, request);
  await assert.rejects(service.request(studio, request), /already has a job open/);
  await service.cancel("t-lens", [...rows.keys()][0]!);
  await service.request(studio, request);
  assert.equal(rows.size, 2);
  await assert.rejects(service.request(studio, { ...request, vendorId: "v-nobody" }), /isn't taking work/);
  assert.ok(kato);
});
