import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Offering, OfferingInput, SaveOutcome, Service } from "./core";
import { OfferingError, type OfferingStore } from "./ports";
import { OfferingService } from "./service";

// The service against an in-memory OfferingStore that keeps tenants apart
// the way the real one must: by the scope's tenant id on every call.

type Owned<T> = T & { tenantId: string };

function memoryStore() {
  const services: Owned<Service>[] = [];
  const packages: Owned<Omit<Offering, "serviceName">>[] = [];
  const strip = <T>({ tenantId, ...row }: Owned<T>): T => (void tenantId, row as T);
  const withService = (p: Owned<Omit<Offering, "serviceName">>): Offering => ({
    ...strip(p),
    serviceName: services.find((s) => s.id === p.serviceId)!.name,
  });
  const svc = (scope: TenantScope, id: string) => services.find((s) => s.tenantId === scope.tenantId && s.id === id);
  const pkg = (scope: TenantScope, id: string) => packages.find((p) => p.tenantId === scope.tenantId && p.id === id);
  const now = (archived: boolean) => (archived ? "2026-10-06T12:00:00Z" : null);
  const store: OfferingStore = {
    services: async (scope, archived) => services.filter((s) => s.tenantId === scope.tenantId && !!s.archivedAt === archived).map(strip),
    service: async (scope, id) => {
      const s = svc(scope, id);
      return s ? strip(s) : null;
    },
    findActiveService: async (scope, name) => {
      const s = services.find((r) => r.tenantId === scope.tenantId && !r.archivedAt && r.name.toLowerCase() === name.toLowerCase());
      return s ? strip(s) : null;
    },
    serviceSlugs: async (scope) => services.filter((s) => s.tenantId === scope.tenantId).map((s) => s.slug),
    createService: async (scope, input) => {
      const position = services.filter((s) => s.tenantId === scope.tenantId).length + 1;
      const row = { ...input, id: `s${services.length + 1}`, tenantId: scope.tenantId, position, archivedAt: null, createdAt: "2026-10-06T00:00:00Z" };
      services.push(row);
      return strip(row);
    },
    updateService: async (scope, id, input) => {
      const s = svc(scope, id);
      if (!s) return null;
      Object.assign(s, input);
      return strip(s);
    },
    setServiceArchived: async (scope, id, archived) => {
      const s = svc(scope, id);
      if (!s) return null;
      s.archivedAt = now(archived);
      return strip(s);
    },
    packages: async (scope, { archived, serviceId }) =>
      packages
        .filter((p) => p.tenantId === scope.tenantId && !!p.archivedAt === archived && (!serviceId || p.serviceId === serviceId))
        .map(withService),
    package: async (scope, id) => {
      const p = pkg(scope, id);
      return p ? withService(p) : null;
    },
    findActivePackage: async (scope, serviceId, name) => {
      const p = packages.find(
        (r) => r.tenantId === scope.tenantId && r.serviceId === serviceId && !r.archivedAt && r.name.toLowerCase() === name.toLowerCase(),
      );
      return p ? withService(p) : null;
    },
    createPackage: async (scope, serviceId, input) => {
      const position = packages.filter((p) => p.serviceId === serviceId).length + 1;
      const row = { ...input, id: `p${packages.length + 1}`, tenantId: scope.tenantId, serviceId, position, archivedAt: null, createdAt: "2026-10-06T00:00:00Z" };
      packages.push(row);
      return withService(row);
    },
    updatePackage: async (scope, id, input) => {
      const p = pkg(scope, id);
      if (!p) return null;
      Object.assign(p, input);
      return withService(p);
    },
    setPackageArchived: async (scope, id, archived) => {
      const p = pkg(scope, id);
      if (!p) return null;
      p.archivedAt = now(archived);
      return withService(p);
    },
  };
  return { store, services, packages };
}

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");
const wedding = { name: "Wedding Photography", description: null };
const tier = (name: string, price: number): OfferingInput => ({ name, description: null, price, inclusions: ["8 hours"] });

function saved<T>(outcome: SaveOutcome<T>): T {
  assert.ok("saved" in outcome, "expected it to be saved");
  return outcome.saved;
}

async function weddingWithTiers(service: OfferingService, studio = studioA) {
  const s = saved(await service.createService(studio, wedding));
  const gold = saved(await service.createPackage(studio, s.id, tier("Gold", 4_000_000)));
  const silver = saved(await service.createPackage(studio, s.id, tier("Silver", 3_000_000)));
  return { s, gold, silver };
}

test("a service gets an address from its name, unique in the studio, and keeps it when renamed", async () => {
  const service = new OfferingService(memoryStore().store);
  const a = saved(await service.createService(studioA, wedding));
  assert.equal(a.slug, "wedding-photography");
  await service.setServiceArchived(studioA, a.id, true);
  const b = saved(await service.createService(studioA, { ...wedding, name: "Wedding photography!" }));
  assert.equal(b.slug, "wedding-photography-2");
  assert.equal(saved(await service.updateService(studioA, b.id, { ...wedding, name: "Weddings" })).slug, "wedding-photography-2");
  assert.equal(saved(await service.createService(studioB, wedding)).slug, "wedding-photography");
});

test("services and their packages come in order: services as added, packages as added", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s } = await weddingWithTiers(service);
  saved(await service.createPackage(studioA, s.id, tier("Bronze", 2_000_000)));
  const baby = saved(await service.createService(studioA, { name: "Baby Shoot", description: null }));
  saved(await service.createPackage(studioA, baby.id, tier("Gold", 400_000)));
  const catalog = await service.catalog(studioA);
  assert.deepEqual(
    catalog.map((c) => [c.name, c.packages.map((p) => p.name)]),
    [
      ["Wedding Photography", ["Gold", "Silver", "Bronze"]],
      ["Baby Shoot", ["Gold"]],
    ],
  );
  assert.deepEqual(
    (await service.onSale(studioA)).map((p) => `${p.serviceName}/${p.name}`),
    ["Wedding Photography/Gold", "Wedding Photography/Silver", "Wedding Photography/Bronze", "Baby Shoot/Gold"],
  );
});

test("service names are unique per studio among what's on sale, ignoring case", async () => {
  const service = new OfferingService(memoryStore().store);
  const s = saved(await service.createService(studioA, wedding));
  const again = await service.createService(studioA, { ...wedding, name: "wedding photography" });
  assert.ok("duplicateOf" in again && again.duplicateOf.id === s.id);
  saved(await service.createService(studioB, wedding));
});

test("package names are unique within their service only", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold } = await weddingWithTiers(service);
  const again = await service.createPackage(studioA, s.id, tier("gold", 1));
  assert.ok("duplicateOf" in again && again.duplicateOf.id === gold.id);
  const baby = saved(await service.createService(studioA, { name: "Baby Shoot", description: null }));
  saved(await service.createPackage(studioA, baby.id, tier("Gold", 400_000)));
});

test("a package update keeps its own name but can't take a sibling's", async () => {
  const service = new OfferingService(memoryStore().store);
  const { gold, silver } = await weddingWithTiers(service);
  assert.equal(saved(await service.updatePackage(studioA, gold.id, tier("Gold", 4_500_000))).price, 4_500_000);
  const clash = await service.updatePackage(studioA, silver.id, tier("Gold", 1));
  assert.ok("duplicateOf" in clash && clash.duplicateOf.id === gold.id);
});

test("an archived name is free again, and restoring refuses a clash", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold } = await weddingWithTiers(service);
  await service.setPackageArchived(studioA, gold.id, true);
  saved(await service.createPackage(studioA, s.id, tier("Gold", 1)));
  await assert.rejects(service.setPackageArchived(studioA, gold.id, false), /already has a package called “Gold”/);
  assert.equal((await service.packages(studioA, s.id, true)).length, 1);

  await service.setServiceArchived(studioA, s.id, true);
  saved(await service.createService(studioA, wedding));
  await assert.rejects(service.setServiceArchived(studioA, s.id, false), /already called “Wedding Photography”/);
});

test("an archived service's packages are off sale, and it takes no new ones", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s } = await weddingWithTiers(service);
  await service.setServiceArchived(studioA, s.id, true);
  assert.deepEqual(await service.onSale(studioA), []);
  assert.deepEqual(await service.catalog(studioA), []);
  await assert.rejects(service.createPackage(studioA, s.id, tier("Bronze", 1)), /archived/);
});

test("one studio can't read, change or archive another's services or packages, even with their ids", async () => {
  const { store, services, packages } = memoryStore();
  const service = new OfferingService(store);
  const { s, gold } = await weddingWithTiers(service);
  assert.equal(await service.service(studioB, s.id), null);
  assert.equal(await service.package(studioB, gold.id), null);
  await assert.rejects(service.updateService(studioB, s.id, { ...wedding, name: "Mine" }), OfferingError);
  await assert.rejects(service.setServiceArchived(studioB, s.id, true), OfferingError);
  await assert.rejects(service.createPackage(studioB, s.id, tier("Sneaky", 1)), OfferingError);
  await assert.rejects(service.updatePackage(studioB, gold.id, tier("Gold", 1)), OfferingError);
  await assert.rejects(service.setPackageArchived(studioB, gold.id, true), OfferingError);
  await assert.rejects(service.setPackageArchived(studioB, gold.id, false), OfferingError);
  assert.equal(services[0].name, "Wedding Photography");
  assert.equal(services[0].archivedAt, null);
  assert.equal(packages[0].price, 4_000_000);
  assert.equal(packages[0].archivedAt, null);
  assert.equal(packages.length, 2);
  assert.deepEqual(await service.catalog(studioB), []);
});
