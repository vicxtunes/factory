import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Offering, OfferingInput, Service } from "./core";
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
    serviceBySlug: async (scope, slug) => {
      const s = services.find((r) => r.tenantId === scope.tenantId && r.slug === slug);
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
const tier = (name: string, price: number): OfferingInput => ({ name, description: null, price, inclusions: ["8 hours"] });

function saved<T>(outcome: { saved: T } | { duplicateOf: unknown }): T {
  assert.ok("saved" in outcome, "expected it to be saved");
  return outcome.saved;
}

const form = (name: string, packages: (OfferingInput & { id?: string })[] = []) => ({ name, description: null, packages });
/** A saved package as the form sends it back: with its id, so it's kept. */
const kept = (p: Offering, change: Partial<OfferingInput> = {}) => ({ id: p.id, name: p.name, description: p.description, price: p.price, inclusions: p.inclusions, ...change });

async function weddingWithTiers(service: OfferingService, studio = studioA) {
  const s = saved(await service.saveService(studio, null, form("Wedding Photography", [tier("Gold", 4_000_000), tier("Silver", 3_000_000)])));
  const [gold, silver] = s.packages;
  return { s, gold, silver };
}

test("one save adds a service with all its packages, in the order listed", async () => {
  const service = new OfferingService(memoryStore().store);
  const s = saved(
    await service.saveService(studioA, null, form("Wedding Photography", [tier("Gold", 4_500_000), tier("Silver", 3_000_000), tier("Bronze", 1_800_000), tier("Custom", 0)])),
  );
  assert.deepEqual(s.packages.map((p) => [p.name, p.price, p.serviceName]), [
    ["Gold", 4_500_000, "Wedding Photography"],
    ["Silver", 3_000_000, "Wedding Photography"],
    ["Bronze", 1_800_000, "Wedding Photography"],
    ["Custom", 0, "Wedding Photography"],
  ]);
  saved(await service.saveService(studioA, null, form("Baby Shoot", [tier("Gold", 400_000)])));
  assert.deepEqual(
    (await service.onSale(studioA)).map((p) => `${p.serviceName}/${p.name}`),
    ["Wedding Photography/Gold", "Wedding Photography/Silver", "Wedding Photography/Bronze", "Wedding Photography/Custom", "Baby Shoot/Gold"],
  );
});

test("one save edits it all: changed, added and removed packages (removed ones are archived, not deleted)", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold, silver } = await weddingWithTiers(service);
  const after = saved(
    await service.saveService(studioA, s.id, {
      name: "Weddings",
      description: "Your whole day.",
      packages: [kept(gold, { price: 4_800_000 }), tier("Platinum", 6_000_000)],
    }),
  );
  assert.equal(after.name, "Weddings");
  assert.equal(after.description, "Your whole day.");
  assert.deepEqual(after.packages.map((p) => [p.name, p.price]), [["Gold", 4_800_000], ["Platinum", 6_000_000]]);
  assert.equal(after.packages[0].id, gold.id, "kept its id: quotations still point at it");
  assert.deepEqual((await service.packages(studioA, s.id, true)).map((p) => p.id), [silver.id], "Silver archived");
  assert.equal((await service.package(studioA, silver.id))?.archivedAt != null, true);
});

test("a service gets an address from its name, unique in the studio, and keeps it when renamed", async () => {
  const service = new OfferingService(memoryStore().store);
  const a = saved(await service.saveService(studioA, null, form("Wedding Photography")));
  assert.equal(a.slug, "wedding-photography");
  await service.setServiceArchived(studioA, a.id, true);
  const b = saved(await service.saveService(studioA, null, form("Wedding photography!")));
  assert.equal(b.slug, "wedding-photography-2");
  assert.equal(saved(await service.saveService(studioA, b.id, form("Weddings"))).slug, "wedding-photography-2");
  assert.equal(saved(await service.saveService(studioB, null, form("Wedding Photography"))).slug, "wedding-photography");
});

test("service names are unique per studio among what's on sale, ignoring case; a refused save writes nothing", async () => {
  const { store, packages } = memoryStore();
  const service = new OfferingService(store);
  const { s } = await weddingWithTiers(service);
  const again = await service.saveService(studioA, null, form("wedding photography", [tier("Gold", 1)]));
  assert.ok("duplicateOf" in again && again.duplicateOf.id === s.id);
  assert.equal(packages.length, 2, "its packages weren't added");
  const baby = saved(await service.saveService(studioA, null, form("Baby Shoot")));
  const rename = await service.saveService(studioA, baby.id, form("Wedding Photography"));
  assert.ok("duplicateOf" in rename);
  saved(await service.saveService(studioB, null, form("Wedding Photography")));
});

test("package names are unique within their service only; a removed name can be reused in the same save", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold, silver } = await weddingWithTiers(service);
  saved(await service.saveService(studioA, null, form("Baby Shoot", [tier("Gold", 400_000)])));
  const after = saved(await service.saveService(studioA, s.id, form("Wedding Photography", [kept(silver), tier("Gold", 5_000_000)])));
  assert.deepEqual(after.packages.map((p) => [p.name, p.price]), [["Silver", 3_000_000], ["Gold", 5_000_000]]);
  assert.notEqual(after.packages[1].id, gold.id, "a new Gold; the old one is archived");
});

test("an archived name is free again, and restoring refuses a clash", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold, silver } = await weddingWithTiers(service);
  saved(await service.saveService(studioA, s.id, form("Wedding Photography", [kept(silver), tier("Gold", 1)])));
  await assert.rejects(service.setPackageArchived(studioA, gold.id, false), /already has a package called “Gold”/);

  await service.setServiceArchived(studioA, s.id, true);
  saved(await service.saveService(studioA, null, form("Wedding Photography")));
  await assert.rejects(service.setServiceArchived(studioA, s.id, false), /already called “Wedding Photography”/);
});

test("an archived service's packages are off sale, and it takes no new ones (refused before anything is written)", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold } = await weddingWithTiers(service);
  await service.setServiceArchived(studioA, s.id, true);
  assert.deepEqual(await service.onSale(studioA), []);
  assert.deepEqual(await service.catalog(studioA), []);
  await assert.rejects(service.saveService(studioA, s.id, form("Renamed", [kept(gold), tier("Bronze", 1)])), /archived/);
  assert.equal((await service.service(studioA, s.id))?.name, "Wedding Photography");
});

test("one studio can't read, change or archive another's services or packages, even with their ids", async () => {
  const { store, services, packages } = memoryStore();
  const service = new OfferingService(store);
  const { s, gold } = await weddingWithTiers(service);
  const other = saved(await service.saveService(studioB, null, form("Portraits", [tier("Gold", 1)])));
  assert.equal(await service.service(studioB, s.id), null);
  assert.equal(await service.package(studioB, gold.id), null);
  await assert.rejects(service.saveService(studioB, s.id, form("Mine", [tier("Sneaky", 1)])), OfferingError);
  await assert.rejects(service.saveService(studioB, other.id, form("Portraits", [kept(gold, { price: 1 })])), OfferingError, "a package of another service");
  await assert.rejects(service.setServiceArchived(studioB, s.id, true), OfferingError);
  await assert.rejects(service.setPackageArchived(studioB, gold.id, true), OfferingError);
  await assert.rejects(service.setPackageArchived(studioB, gold.id, false), OfferingError);
  assert.equal(services[0].name, "Wedding Photography");
  assert.equal(services[0].archivedAt, null);
  assert.equal(packages[0].price, 4_000_000);
  assert.equal(packages[0].archivedAt, null);
  assert.deepEqual((await service.catalog(studioB)).map((c) => c.packages.map((p) => p.name)), [["Gold"]], "Portraits kept its own Gold");
});

test("a service's showroom page: by its address, on sale only, with its packages on sale, in this studio only", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold } = await weddingWithTiers(service);
  saved(await service.saveService(studioA, s.id, form("Wedding Photography", [kept(gold)])));
  const page = await service.publicService(studioA, "wedding-photography");
  assert.deepEqual(page?.packages.map((p) => p.name), ["Gold"]);
  assert.equal(await service.publicService(studioB, "wedding-photography"), null);
  assert.equal(await service.publicService(studioA, "nope"), null);
  await service.setServiceArchived(studioA, s.id, true);
  assert.equal(await service.publicService(studioA, "wedding-photography"), null);
});
