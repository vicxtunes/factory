import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Customer, CustomerInput } from "./core";
import { CustomerError, type CustomerStore } from "./ports";
import { CustomerService } from "./service";

// The service against an in-memory CustomerStore that keeps tenants apart
// the way the real one must: by the scope's tenant id on every call.

function memoryStore() {
  const rows: (Customer & { tenantId: string })[] = [];
  const mine = (scope: TenantScope, id: string) => rows.find((r) => r.tenantId === scope.tenantId && r.id === id);
  const plain = (row: Customer & { tenantId: string }): Customer => {
    const { tenantId, ...customer } = row;
    void tenantId;
    return customer;
  };
  const store: CustomerStore = {
    list: async (scope, archived) => rows.filter((r) => r.tenantId === scope.tenantId && !!r.archivedAt === archived).map(plain),
    get: async (scope, id) => {
      const r = mine(scope, id);
      return r ? plain(r) : null;
    },
    findByPhone: async (scope, phone) => {
      const r = rows.find((c) => c.tenantId === scope.tenantId && c.phone === phone);
      return r ? plain(r) : null;
    },
    create: async (scope, input) => {
      const row = { ...input, id: `c${rows.length + 1}`, tenantId: scope.tenantId, archivedAt: null, createdAt: "2026-10-03T00:00:00Z" };
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
const grace: CustomerInput = { name: "Grace", phone: "0772123456", email: null, notes: "Wedding in December" };

function saved(outcome: Awaited<ReturnType<CustomerService["create"]>>): Customer {
  assert.ok("saved" in outcome, "expected the customer to be saved");
  return outcome.saved;
}

test("create saves a customer in the studio", async () => {
  const service = new CustomerService(memoryStore().store);
  const c = saved(await service.create(studioA, grace));
  assert.equal((await service.get(studioA, c.id))?.name, "Grace");
});

test("a phone number is saved once per studio", async () => {
  const service = new CustomerService(memoryStore().store);
  const first = saved(await service.create(studioA, grace));
  const again = await service.create(studioA, { ...grace, name: "Grace N." });
  assert.deepEqual("duplicateOf" in again && again.duplicateOf.id, first.id);
  // Another studio can have its own customer with the same number.
  saved(await service.create(studioB, grace));
});

test("customers without a phone are never duplicates", async () => {
  const service = new CustomerService(memoryStore().store);
  saved(await service.create(studioA, { ...grace, phone: null }));
  saved(await service.create(studioA, { ...grace, phone: null }));
});

test("update refuses another customer's phone, but keeps your own", async () => {
  const service = new CustomerService(memoryStore().store);
  const g = saved(await service.create(studioA, grace));
  const p = saved(await service.create(studioA, { ...grace, name: "Peter", phone: "0700111222" }));
  const clash = await service.update(studioA, p.id, { ...grace, name: "Peter" });
  assert.ok("duplicateOf" in clash && clash.duplicateOf.id === g.id);
  assert.equal(saved(await service.update(studioA, g.id, { ...grace, notes: "Moved to January" })).notes, "Moved to January");
});

test("one studio can't read, change or archive another's customer, even with its id", async () => {
  const { store, rows } = memoryStore();
  const service = new CustomerService(store);
  const g = saved(await service.create(studioA, grace));
  assert.equal(await service.get(studioB, g.id), null);
  await assert.rejects(service.update(studioB, g.id, { ...grace, name: "Hijacked" }), CustomerError);
  await assert.rejects(service.setArchived(studioB, g.id, true), CustomerError);
  assert.equal(rows[0].name, "Grace");
  assert.equal(rows[0].archivedAt, null);
  assert.deepEqual(await service.list(studioB), []);
});

test("archived customers leave the everyday list and can come back", async () => {
  const service = new CustomerService(memoryStore().store);
  const g = saved(await service.create(studioA, grace));
  saved(await service.create(studioA, { ...grace, name: "Aaron", phone: null }));
  await service.setArchived(studioA, g.id, true);
  assert.deepEqual((await service.list(studioA)).map((c) => c.name), ["Aaron"]);
  assert.deepEqual((await service.list(studioA, true)).map((c) => c.name), ["Grace"]);
  await service.setArchived(studioA, g.id, false);
  assert.deepEqual((await service.list(studioA)).map((c) => c.name), ["Aaron", "Grace"]);
});
