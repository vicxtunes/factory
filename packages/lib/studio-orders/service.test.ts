import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { LinkedOrder, OrderChoice } from "./core";
import { StudioOrderError, type StudioOrderStore } from "./ports";
import { StudioOrderService } from "./service";

// The service against an in-memory store that refuses what the database
// function refuses: another owner's order, another studio's project, an order
// already linked elsewhere.

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");

function fakes() {
  const orders = [
    { id: "o1", owner: "amina", placedAt: "2026-10-01", finished: false },
    { id: "o2", owner: "amina", placedAt: "2026-10-02", finished: true },
    { id: "o3", owner: "amina", placedAt: "2026-10-03", finished: false },
    { id: "o9", owner: "brian", placedAt: "2026-10-03", finished: false },
  ];
  const owners: Record<string, string> = { "studio-a": "amina", "studio-b": "brian" };
  const projects: Record<string, string> = { wedding: "studio-a", portraits: "studio-a", graduation: "studio-b" };
  const links: { tenantId: string; projectId: string; orderId: string }[] = [];
  const asLinked = (l: (typeof links)[number]): LinkedOrder => {
    const o = orders.find((x) => x.id === l.orderId)!;
    return { orderId: o.id, orderNo: o.id, placedAt: o.placedAt, deliveryDate: null, items: [], progress: "", finished: o.finished, cancelled: false, projectId: l.projectId, projectTitle: l.projectId };
  };
  const store: StudioOrderStore = {
    linked: async (s, projectId) => links.filter((l) => l.tenantId === s.tenantId && (!projectId || l.projectId === projectId)).map(asLinked),
    unlinked: async (_s, owner) =>
      orders.filter((o) => o.owner === owner && !links.some((l) => l.orderId === o.id)).map((o): OrderChoice => ({ orderId: o.id, orderNo: o.id, placedAt: o.placedAt, summary: "" })),
    link: async (s, projectId, orderId) => {
      if (orders.find((o) => o.id === orderId)?.owner !== owners[s.tenantId]) throw new StudioOrderError("That order isn't one of yours.");
      if (projects[projectId] !== s.tenantId) throw new StudioOrderError("That project no longer exists.");
      const existing = links.find((l) => l.orderId === orderId);
      if (existing && existing.projectId !== projectId) throw new StudioOrderError("That order is already linked to another project.");
      if (!existing) links.push({ tenantId: s.tenantId, projectId, orderId });
    },
    unlink: async (s, projectId, orderId) => {
      const i = links.findIndex((l) => l.tenantId === s.tenantId && l.projectId === projectId && l.orderId === orderId);
      if (i < 0) return false;
      links.splice(i, 1);
      return true;
    },
  };
  return { service: new StudioOrderService(store), links };
}

test("link the owner's orders to a project; in-hand first, then newest", async () => {
  const { service } = fakes();
  for (const o of ["o1", "o2", "o3"]) await service.link(studioA, "wedding", o);
  assert.deepEqual((await service.forProject(studioA, "wedding")).map((o) => o.orderId), ["o3", "o1", "o2"]);
  await service.link(studioA, "wedding", "o1");
  assert.equal((await service.forStudio(studioA)).length, 3, "linking again to the same project is a no-op");
});

test("one project per order; choices are the owner's unlinked orders, newest first", async () => {
  const { service } = fakes();
  await service.link(studioA, "wedding", "o1");
  await assert.rejects(service.link(studioA, "portraits", "o1"), /already linked to another project/);
  assert.deepEqual((await service.choices(studioA, "amina")).map((c) => c.orderId), ["o3", "o2"]);
});

test("unlinking takes it off the project and makes it a choice again", async () => {
  const { service } = fakes();
  await service.link(studioA, "wedding", "o1");
  await service.unlink(studioA, "wedding", "o1");
  assert.deepEqual(await service.forProject(studioA, "wedding"), []);
  await assert.rejects(service.unlink(studioA, "wedding", "o1"), /isn't linked/);
});

test("a studio can't link another owner's order, use another studio's project, or touch its links", async () => {
  const { service, links } = fakes();
  await assert.rejects(service.link(studioA, "wedding", "o9"), /isn't one of yours/);
  await assert.rejects(service.link(studioB, "graduation", "o1"), /isn't one of yours/);
  await assert.rejects(service.link(studioB, "wedding", "o9"), /project no longer exists/);
  await service.link(studioA, "wedding", "o1");
  assert.deepEqual(await service.forStudio(studioB), []);
  await assert.rejects(service.unlink(studioB, "wedding", "o1"), StudioOrderError);
  assert.equal(links.length, 1);
});
