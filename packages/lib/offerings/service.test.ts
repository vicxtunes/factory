import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Offering, OfferingInput, OfferingSaveOutcome } from "./core";
import { OfferingError, type OfferingStore } from "./ports";
import { OfferingService } from "./service";

// The service against an in-memory OfferingStore that keeps tenants apart
// the way the real one must: by the scope's tenant id on every call.

type Row = Offering & { tenantId: string };

function memoryStore() {
  const rows: Row[] = [];
  const plain = (row: Row): Offering => {
    const { tenantId, ...offering } = row;
    void tenantId;
    return offering;
  };
  const mine = (scope: TenantScope, id: string) => rows.find((r) => r.tenantId === scope.tenantId && r.id === id);
  const store: OfferingStore = {
    list: async (scope, archived) => rows.filter((r) => r.tenantId === scope.tenantId && !!r.archivedAt === archived).map(plain),
    get: async (scope, id) => {
      const r = mine(scope, id);
      return r ? plain(r) : null;
    },
    findActiveByName: async (scope, name) => {
      const r = rows.find((o) => o.tenantId === scope.tenantId && !o.archivedAt && o.name.toLowerCase() === name.toLowerCase());
      return r ? plain(r) : null;
    },
    create: async (scope, input) => {
      const row: Row = { ...input, id: `o${rows.length + 1}`, tenantId: scope.tenantId, archivedAt: null, createdAt: "2026-10-03T00:00:00Z" };
      rows.push(row);
      return plain(row);
    },
    update: async (scope, id, input) => {
      const r = mine(scope, id);
      if (!r) return null;
      Object.assign(r, input);
      return plain(r);
    },
    setArchived: async (scope, id, archived) => {
      const r = mine(scope, id);
      if (!r) return null;
      r.archivedAt = archived ? "2026-10-03T12:00:00Z" : null;
      return plain(r);
    },
  };
  return { store, rows };
}

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");
const gold: OfferingInput = { kind: "package", name: "Wedding Gold", description: null, price: 2_500_000, inclusions: ["8 hours", "300 photos"] };
const extraHour: OfferingInput = { kind: "service", name: "Extra hour", description: null, price: 150_000, inclusions: [] };

function saved(outcome: OfferingSaveOutcome): Offering {
  assert.ok("saved" in outcome, "expected it to be saved");
  return outcome.saved;
}

test("list shows packages first, then services, by name", async () => {
  const service = new OfferingService(memoryStore().store);
  saved(await service.create(studioA, extraHour));
  saved(await service.create(studioA, { ...gold, name: "Birthday" }));
  saved(await service.create(studioA, gold));
  assert.deepEqual((await service.list(studioA)).map((o) => o.name), ["Birthday", "Wedding Gold", "Extra hour"]);
});

test("names are unique per studio among what's on sale, ignoring case", async () => {
  const service = new OfferingService(memoryStore().store);
  const g = saved(await service.create(studioA, gold));
  const again = await service.create(studioA, { ...extraHour, name: "wedding gold" });
  assert.ok("duplicateOf" in again && again.duplicateOf.id === g.id);
  saved(await service.create(studioB, gold));
});

test("update keeps its own name but can't take another's", async () => {
  const service = new OfferingService(memoryStore().store);
  const g = saved(await service.create(studioA, gold));
  const h = saved(await service.create(studioA, extraHour));
  assert.equal(saved(await service.update(studioA, g.id, { ...gold, price: 2_800_000 })).price, 2_800_000);
  const clash = await service.update(studioA, h.id, { ...extraHour, name: "Wedding Gold" });
  assert.ok("duplicateOf" in clash && clash.duplicateOf.id === g.id);
});

test("an archived name is free again, and restoring refuses a clash", async () => {
  const service = new OfferingService(memoryStore().store);
  const old = saved(await service.create(studioA, gold));
  await service.setArchived(studioA, old.id, true);
  saved(await service.create(studioA, gold));
  await assert.rejects(service.setArchived(studioA, old.id, false), /already called “Wedding Gold”/);
  assert.equal((await service.list(studioA, true)).length, 1);
});

test("one studio can't read, change or archive another's offering, even with its id", async () => {
  const { store, rows } = memoryStore();
  const service = new OfferingService(store);
  const g = saved(await service.create(studioA, gold));
  assert.equal(await service.get(studioB, g.id), null);
  await assert.rejects(service.update(studioB, g.id, { ...gold, price: 1 }), OfferingError);
  await assert.rejects(service.setArchived(studioB, g.id, true), OfferingError);
  await assert.rejects(service.setArchived(studioB, g.id, false), OfferingError);
  assert.equal(rows[0].price, 2_500_000);
  assert.equal(rows[0].archivedAt, null);
  assert.deepEqual(await service.list(studioB), []);
});
