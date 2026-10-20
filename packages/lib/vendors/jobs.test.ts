import assert from "node:assert/strict";
import { test } from "node:test";

import type { JobStatus, JobView, VendorJob } from "./core";
import { VendorJobService } from "./jobs";
import { VendorError, type VendorJobStore } from "./ports";
import { VendorService } from "./service";
import { memoryStore } from "./testing";

// The job service against in-memory stores: who may move a job, when, where
// the money is, and who's told. The money moves themselves are the
// database's (vendor_job_fund/release/refund); here they're recorded.

const HELD: JobStatus[] = ["in_progress", "delivered", "disputed"];

function memoryJobs(vendorsById: (id: string) => Promise<{ name: string; category: string; clientId: string } | null>) {
  const rows = new Map<string, VendorJob>();
  const money: string[] = [];
  const view = async (job: VendorJob): Promise<JobView> => {
    const vendor = (await vendorsById(job.vendorId))!;
    return { ...job, vendor: { ...vendor, photoKey: null }, studio: { name: "Lens & Light", ownerClientId: "c-owner" }, projectTitle: "Wedding" };
  };
  const set = (id: string, changes: Partial<VendorJob>) => rows.set(id, { ...rows.get(id)!, ...changes });
  const store: VendorJobStore = {
    create: async (tenantId, request, folderId, requestedByName) => {
      if ([...rows.values()].some((j) => j.projectId === request.projectId && j.vendorId === request.vendorId && !["declined", "cancelled", "paid", "refunded"].includes(j.status))) {
        throw new VendorError("This vendor already has a job open on this project.");
      }
      const job: VendorJob = {
        id: `j${rows.size + 1}`,
        tenantId,
        ...request,
        folderId,
        status: "requested",
        fee: null,
        requestedByName,
        createdAt: "2026-11-01T00:00:00Z",
        deliveredAt: null,
        fundedAt: null,
        disputedBy: null,
        disputeReason: null,
        overdueAlertedAt: null,
      };
      rows.set(job.id, job);
      return job;
    },
    get: async (id) => (rows.has(id) ? view(rows.get(id)!) : null),
    forVendor: async (vendorId) => Promise.all([...rows.values()].filter((j) => j.vendorId === vendorId).map(view)),
    forProject: async (tenantId, projectId) => Promise.all([...rows.values()].filter((j) => j.tenantId === tenantId && j.projectId === projectId).map(view)),
    needingAttention: async () => Promise.all([...rows.values()].filter((j) => j.status === "delivered" || j.status === "disputed").map(view)),
    move: async (id, from, to, dispute) => {
      const job = rows.get(id);
      if (!job || !from.includes(job.status)) return null;
      set(id, { status: to, ...(to === "delivered" ? { deliveredAt: "2026-11-02T10:00:00Z" } : {}), ...(dispute ? { disputedBy: dispute.by, disputeReason: dispute.reason } : {}) });
      return rows.get(id)!;
    },
    fund: async (tenantId, id) => {
      const job = rows.get(id)!;
      if (job.tenantId !== tenantId || !["awaiting_funds", "samples_sent"].includes(job.status)) throw new VendorError("This job has moved on.");
      set(id, { status: "in_progress", fundedAt: "2026-11-01T12:00:00Z" });
      money.push(`fund ${id}`);
    },
    release: async (id, actor) => {
      if (!["delivered", "disputed"].includes(rows.get(id)!.status)) throw new VendorError("This job has moved on.");
      set(id, { status: "paid", fee: 0 });
      money.push(`release ${id} by ${actor.type}`);
    },
    refund: async (id, actor) => {
      if (!HELD.includes(rows.get(id)!.status)) throw new VendorError("This job has moved on.");
      set(id, { status: "refunded" });
      money.push(`refund ${id} by ${actor.type}`);
    },
    setFolder: async (tenantId, id, folderId) => {
      const job = rows.get(id);
      if (!job || job.tenantId !== tenantId || !["requested", "samples", "samples_sent", "awaiting_funds", "in_progress", "delivered", "disputed"].includes(job.status)) return false;
      set(id, { folderId });
      return true;
    },
    markWarned: async (id) => void set(id, { overdueAlertedAt: "2026-11-03T10:00:00Z" }),
  };
  return { store, rows, money };
}

async function setUp() {
  const { store: vendorStore } = memoryStore();
  const vendors = new VendorService(vendorStore, {} as never, () => "x");
  const kato = await vendors.join({ clientId: "c-kato", name: "Kato" }, { kind: "individual", businessName: null, category: "photo_editor", skills: ["Culling"], socials: {} });
  const { store, rows, money } = memoryJobs(async (id) => vendorStore.get(id));
  const told: { to: string; title: string }[] = [];
  const service = new VendorJobService(store, vendorStore, {
    notify: async (to, m) => void told.push({ to, title: m.title }),
    tellBoss: async (m) => void told.push({ to: "boss", title: m.title }),
  });
  const studio = { tenantId: "t-lens", name: "Lens & Light", actorName: "Amina" };
  const request = { projectId: "p-wedding", vendorId: kato.id, brief: "Edit 300 photos", samplesWanted: null, dueOn: null, price: 300_000 };
  const owner = { id: "c-owner", name: "Amina" };
  return { service, kato, rows, money, told, studio, request, owner };
}

test("no samples: accepted, paid in to Aming, delivered, approved and released to the vendor", async () => {
  const { service, rows, money, told, studio, request, owner } = await setUp();
  await service.request(studio, request, "f-kato");
  const [id] = [...rows.keys()];
  assert.equal(rows.get(id!)!.folderId, "f-kato");
  assert.deepEqual(told.at(-1), { to: "c-kato", title: "Job request from Lens & Light" });

  await service.respond("c-kato", id!, true);
  assert.equal(rows.get(id!)!.status, "awaiting_funds", "nothing held yet");
  await assert.rejects(service.deliver("c-kato", id!), /in progress/, "no work before the money is in");

  await service.fund("t-lens", id!, owner);
  assert.equal(rows.get(id!)!.status, "in_progress");
  await assert.rejects(service.cancel("t-lens", id!), /raise a dispute/, "held money isn't cancelled away");

  await service.deliver("c-kato", id!);
  await service.approve("t-lens", id!, owner);
  assert.deepEqual(money, [`fund ${id}`, `release ${id} by client`]);
  assert.equal(told.at(-1)!.title, "Lens & Light approved your work");
});

test("samples first: nothing is held until the studio approves them, and it may cancel instead", async () => {
  const { service, rows, money, studio, request, owner } = await setUp();
  await service.request(studio, { ...request, samplesWanted: "Five in our style" }, "f-kato");
  const [id] = [...rows.keys()];
  await service.respond("c-kato", id!, true);
  assert.equal(rows.get(id!)!.status, "samples");
  await assert.rejects(service.fund("t-lens", id!, owner), /moved on/, "can't pay in before the samples are sent");
  await service.sendSamples("c-kato", id!);
  assert.equal(rows.get(id!)!.status, "samples_sent");
  await service.cancel("t-lens", id!);
  assert.equal(rows.get(id!)!.status, "cancelled");
  assert.deepEqual(money, [], "not good enough: no money ever moved");

  await service.request(studio, { ...request, samplesWanted: "Five in our style" }, "f-kato");
  const second = [...rows.keys()][1]!;
  await service.respond("c-kato", second, true);
  await service.sendSamples("c-kato", second);
  await service.fund("t-lens", second, owner);
  assert.equal(rows.get(second)!.status, "in_progress", "approved samples: the work goes ahead");
});

test("a dispute goes to the boss, and staff release or refund the held money", async () => {
  const { service, rows, money, told, studio, request, owner } = await setUp();
  await service.request(studio, request, "f-kato");
  const [id] = [...rows.keys()];
  await service.respond("c-kato", id!, true);
  await service.fund("t-lens", id!, owner);
  await service.deliver("c-kato", id!);
  await service.studioDispute("t-lens", id!, "The colours are off on half of them");
  assert.equal(rows.get(id!)!.status, "disputed");
  assert.ok(told.some((t) => t.to === "boss" && t.title === "A vendor job is disputed"));
  await assert.rejects(service.approve("t-lens", id!, owner), /delivered/, "the studio can't release it once disputed");

  await service.settle(id!, "refund", { id: "u-boss", name: "Boss" });
  assert.equal(rows.get(id!)!.status, "refunded");
  assert.equal(money.at(-1), `refund ${id} by dashboard_user`);
  await assert.rejects(service.settle(id!, "release", { id: "u-boss", name: "Boss" }), /settled already/);
});

test("the vendor can give up work in progress: the studio is refunded", async () => {
  const { service, rows, money, studio, request, owner } = await setUp();
  await service.request(studio, request, "f-kato");
  const [id] = [...rows.keys()];
  await service.respond("c-kato", id!, true);
  await service.fund("t-lens", id!, owner);
  await service.withdraw("c-kato", id!);
  assert.equal(rows.get(id!)!.status, "refunded");
  assert.equal(money.at(-1), `refund ${id} by client`);
});

test("unanswered delivered work: the boss and the studio are warned after a day, it's released after two", async () => {
  const { service, rows, money, told, studio, request, owner } = await setUp();
  await service.request(studio, request, "f-kato");
  const [id] = [...rows.keys()];
  await service.respond("c-kato", id!, true);
  await service.fund("t-lens", id!, owner);
  await service.deliver("c-kato", id!);
  const delivered = new Date(rows.get(id!)!.deliveredAt!).getTime();

  await service.sweepOverdue(delivered + 12 * 3_600_000);
  assert.equal(rows.get(id!)!.overdueAlertedAt, null, "too early");
  await service.sweepOverdue(delivered + 25 * 3_600_000);
  assert.ok(told.some((t) => t.to === "boss" && t.title === "Vendor work waiting on a studio"));
  assert.ok(told.some((t) => t.to === "c-owner" && t.title === "Work waiting for your approval"));
  const warnings = told.length;
  await service.sweepOverdue(delivered + 30 * 3_600_000);
  assert.equal(told.length, warnings, "warned once");

  await service.sweepOverdue(delivered + 49 * 3_600_000);
  assert.equal(rows.get(id!)!.status, "paid");
  assert.equal(money.at(-1), `release ${id} by system`);
});

test("only the job's own vendor answers it, and only its own studio cancels or pays it", async () => {
  const { service, rows, studio, request, owner } = await setUp();
  await service.request(studio, request, "f-kato");
  const [id] = [...rows.keys()];
  await assert.rejects(service.respond("c-someone-else", id!, true), /doesn't exist/);
  await assert.rejects(service.cancel("t-other-studio", id!), /doesn't exist/);
  await assert.rejects(service.fund("t-other-studio", id!, owner), /doesn't exist/);
  assert.equal(await service.vendorJob("c-someone-else", id!), null);

  await service.respond("c-kato", id!, false);
  await assert.rejects(service.respond("c-kato", id!, true), /answered or called off/, "a declined request stays declined");
  await assert.rejects(service.request(studio, { ...request, vendorId: "v-nobody" }, "f"), /isn't taking work/);
  await service.request(studio, request, "f-kato");
  await assert.rejects(service.request(studio, request, "f-kato"), /already has a job open/);
});

test("a job without a folder (made before jobs had them) is given one while it's open, and the vendor is told", async () => {
  const { service, rows, told, studio, request } = await setUp();
  await service.request(studio, request, "f-kato");
  const [id] = [...rows.keys()];
  rows.set(id!, { ...rows.get(id!)!, folderId: null });

  await assert.rejects(service.setFolder("t-other", id!, async () => "f-new"), /doesn't exist/, "another studio's job");
  await service.setFolder("t-lens", id!, async (projectId) => `f-in-${projectId}`);
  assert.equal(rows.get(id!)!.folderId, "f-in-p-wedding");
  assert.equal(told.at(-1)!.title, "Lens & Light set your folder");

  await service.cancel("t-lens", id!);
  await assert.rejects(service.setFolder("t-lens", id!, async () => "f-new"), /over/, "a job that's over keeps what it had");
});
