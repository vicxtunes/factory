import assert from "node:assert/strict";
import { test } from "node:test";

import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Category, Offering, OfferingInput, Service, ShowroomSettings } from "./core";
import { OfferingError, type OfferingStore } from "./ports";
import { OfferingService } from "./service";

// The service against an in-memory OfferingStore that keeps tenants apart
// the way the real one must: by the scope's tenant id on every call.

type Owned<T> = T & { tenantId: string };

function memoryStore() {
  const categories: Owned<Category>[] = [];
  const services: Owned<Service>[] = [];
  const packages: Owned<Omit<Offering, "serviceName">>[] = [];
  const settings = new Map<string, ShowroomSettings>();
  const strip = <T>({ tenantId, ...row }: Owned<T>): T => (void tenantId, row as T);
  const withService = (p: Owned<Omit<Offering, "serviceName">>): Offering => ({
    ...strip(p),
    serviceName: services.find((s) => s.id === p.serviceId)!.name,
  });
  const mine = <T extends { tenantId: string; id: string }>(rows: T[], scope: TenantScope, id: string) =>
    rows.find((r) => r.tenantId === scope.tenantId && r.id === id);
  const now = (archived: boolean) => (archived ? "2026-10-07T12:00:00Z" : null);
  const lower = (s: string) => s.toLowerCase();
  const store: OfferingStore = {
    categories: async (scope) => categories.filter((c) => c.tenantId === scope.tenantId).map(strip),
    category: async (scope, id) => {
      const c = mine(categories, scope, id);
      return c ? strip(c) : null;
    },
    findActiveCategory: async (scope, name) => {
      const c = categories.find((r) => r.tenantId === scope.tenantId && !r.archivedAt && lower(r.name) === lower(name));
      return c ? strip(c) : null;
    },
    createCategory: async (scope, name) => {
      const position = categories.filter((c) => c.tenantId === scope.tenantId).length + 1;
      const row = { id: `c${categories.length + 1}`, tenantId: scope.tenantId, name, position, archivedAt: null, createdAt: "2026-10-07T00:00:00Z" };
      categories.push(row);
      return strip(row);
    },
    renameCategory: async (scope, id, name) => {
      const c = mine(categories, scope, id);
      if (!c) return null;
      c.name = name;
      return strip(c);
    },
    setCategoryArchived: async (scope, id, archived) => {
      const c = mine(categories, scope, id);
      if (!c) return null;
      c.archivedAt = now(archived);
      return strip(c);
    },
    services: async (scope, archived) => services.filter((s) => s.tenantId === scope.tenantId && !!s.archivedAt === archived).map(strip),
    service: async (scope, id) => {
      const s = mine(services, scope, id);
      return s ? strip(s) : null;
    },
    serviceBySlug: async (scope, slug) => {
      const s = services.find((r) => r.tenantId === scope.tenantId && r.slug === slug);
      return s ? strip(s) : null;
    },
    findActiveService: async (scope, name) => {
      const s = services.find((r) => r.tenantId === scope.tenantId && !r.archivedAt && lower(r.name) === lower(name));
      return s ? strip(s) : null;
    },
    serviceSlugs: async (scope) => services.filter((s) => s.tenantId === scope.tenantId).map((s) => s.slug),
    createService: async (scope, input) => {
      const position = services.filter((s) => s.tenantId === scope.tenantId).length + 1;
      const row = { ...input, id: `s${services.length + 1}`, tenantId: scope.tenantId, position, archivedAt: null, createdAt: "2026-10-07T00:00:00Z" };
      services.push(row);
      return strip(row);
    },
    updateService: async (scope, id, patch) => {
      const s = mine(services, scope, id);
      if (!s) return null;
      Object.assign(s, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
      return strip(s);
    },
    setServiceArchived: async (scope, id, archived) => {
      const s = mine(services, scope, id);
      if (!s) return null;
      s.archivedAt = now(archived);
      return strip(s);
    },
    packages: async (scope, { archived, serviceId }) =>
      packages
        .filter((p) => p.tenantId === scope.tenantId && !!p.archivedAt === archived && (!serviceId || p.serviceId === serviceId))
        .map(withService),
    package: async (scope, id) => {
      const p = mine(packages, scope, id);
      return p ? withService(p) : null;
    },
    findActivePackage: async (scope, serviceId, name) => {
      const p = packages.find((r) => r.tenantId === scope.tenantId && r.serviceId === serviceId && !r.archivedAt && lower(r.name) === lower(name));
      return p ? withService(p) : null;
    },
    createPackage: async (scope, serviceId, input) => {
      const position = packages.filter((p) => p.serviceId === serviceId).length + 1;
      const row = { ...input, id: `p${packages.length + 1}`, tenantId: scope.tenantId, serviceId, position, archivedAt: null, createdAt: "2026-10-07T00:00:00Z" };
      packages.push(row);
      return withService(row);
    },
    updatePackage: async (scope, id, input) => {
      const p = mine(packages, scope, id);
      if (!p) return null;
      Object.assign(p, input);
      return withService(p);
    },
    setPackageArchived: async (scope, id, archived) => {
      const p = mine(packages, scope, id);
      if (!p) return null;
      p.archivedAt = now(archived);
      return withService(p);
    },
    settings: async (scope) => settings.get(scope.tenantId) ?? null,
    saveSettings: async (scope, s) => void settings.set(scope.tenantId, s),
  };
  return { store, categories, services, packages };
}

const scope = (tenantId: string): TenantScope => ({ tenantId, currency: "UGX", locale: "en-UG", timeZone: "Africa/Kampala" });
const studioA = scope("studio-a");
const studioB = scope("studio-b");
const tier = (name: string, price: number): OfferingInput => ({ name, description: null, price, inclusions: ["8 hours"] });

function saved<T>(outcome: { saved: T } | { duplicateOf: unknown }): T {
  assert.ok("saved" in outcome, "expected it to be saved");
  return outcome.saved;
}

/** Weddings → Wedding Photography → Gold, Silver. */
async function setup(service: OfferingService, studio = studioA) {
  const weddings = saved(await service.createCategory(studio, "Weddings"));
  const s = saved(await service.createService(studio, weddings.id, "Wedding Photography"));
  const gold = saved(await service.createPackage(studio, s.id, tier("Gold", 4_000_000)));
  const silver = saved(await service.createPackage(studio, s.id, tier("Silver", 3_000_000)));
  return { weddings, s, gold, silver };
}

test("categories hold services, services hold packages, all in the order added", async () => {
  const service = new OfferingService(memoryStore().store);
  const { weddings, s } = await setup(service);
  saved(await service.createPackage(studioA, s.id, tier("Bronze", 2_000_000)));
  const portraits = saved(await service.createCategory(studioA, "Portraits"));
  const family = saved(await service.createService(studioA, portraits.id, "Family Portraits"));
  saved(await service.createPackage(studioA, family.id, tier("Basic", 300_000)));
  assert.deepEqual(
    (await service.showroom(studioA)).map((c) => [c.name, c.services.map((x) => [x.name, x.packages.map((p) => p.name)])]),
    [
      ["Weddings", [["Wedding Photography", ["Gold", "Silver", "Bronze"]]]],
      ["Portraits", [["Family Portraits", ["Basic"]]]],
    ],
  );
  assert.equal(s.categoryId, weddings.id);
  assert.deepEqual((await service.onSale(studioA)).map((p) => `${p.serviceName}/${p.name}`), [
    "Wedding Photography/Gold",
    "Wedding Photography/Silver",
    "Wedding Photography/Bronze",
    "Family Portraits/Basic",
  ]);
});

test("names: categories and services unique per studio, packages per service, ignoring case", async () => {
  const service = new OfferingService(memoryStore().store);
  const { weddings, s, gold } = await setup(service);
  assert.ok("duplicateOf" in (await service.createCategory(studioA, "weddings")));
  assert.ok("duplicateOf" in (await service.createService(studioA, weddings.id, "WEDDING PHOTOGRAPHY")));
  const dup = await service.createPackage(studioA, s.id, tier("gold", 1));
  assert.ok("duplicateOf" in dup && dup.duplicateOf.id === gold.id);
  const portraits = saved(await service.createCategory(studioA, "Portraits"));
  const family = saved(await service.createService(studioA, portraits.id, "Family Portraits"));
  saved(await service.createPackage(studioA, family.id, tier("Gold", 1)));
  assert.ok("duplicateOf" in (await service.renameCategory(studioA, portraits.id, "Weddings")));
  assert.ok("duplicateOf" in (await service.renameService(studioA, family.id, "Wedding Photography")));
  saved(await service.createCategory(studioB, "Weddings"));
});

test("a service gets an address from its name, unique in the studio, and keeps it when renamed", async () => {
  const service = new OfferingService(memoryStore().store);
  const { weddings, s } = await setup(service);
  assert.equal(s.slug, "wedding-photography");
  await service.setServiceArchived(studioA, s.id, true);
  const again = saved(await service.createService(studioA, weddings.id, "Wedding photography!"));
  assert.equal(again.slug, "wedding-photography-2");
  assert.equal(saved(await service.renameService(studioA, again.id, "Weddings")).slug, "wedding-photography-2");
});

test("edit in place: description, move to another category, package price", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, gold } = await setup(service);
  assert.equal((await service.setServiceDescription(studioA, s.id, "Your whole day.")).description, "Your whole day.");
  const events = saved(await service.createCategory(studioA, "Events"));
  assert.equal((await service.moveService(studioA, s.id, events.id)).categoryId, events.id);
  assert.equal(saved(await service.updatePackage(studioA, gold.id, tier("Gold", 4_500_000))).price, 4_500_000);
  assert.deepEqual((await service.showroom(studioA)).map((c) => c.name), ["Events"], "the emptied category leaves the showroom");
});

test("deactivating: a category takes its services off sale; a service its packages; reactivating brings them back", async () => {
  const service = new OfferingService(memoryStore().store);
  const { weddings, s, gold } = await setup(service);
  await service.setCategoryArchived(studioA, weddings.id, true);
  assert.deepEqual(await service.onSale(studioA), []);
  assert.equal(await service.publicService(studioA, "wedding-photography"), null);
  await assert.rejects(service.createService(studioA, weddings.id, "Elopements"), /inactive/);
  assert.equal((await service.manage(studioA))[0].services.length, 1, "still there to manage");
  await service.setCategoryArchived(studioA, weddings.id, false);

  await service.setServiceArchived(studioA, s.id, true);
  assert.deepEqual(await service.onSale(studioA), []);
  await assert.rejects(service.createPackage(studioA, s.id, tier("Bronze", 1)), /off sale/);
  await service.setServiceArchived(studioA, s.id, false);

  await service.setPackageArchived(studioA, gold.id, true);
  assert.deepEqual((await service.onSale(studioA)).map((p) => p.name), ["Silver"]);
  const manage = (await service.manage(studioA))[0].services[0].packages;
  assert.deepEqual(manage.map((p) => [p.name, !!p.archivedAt]), [["Gold", true], ["Silver", false]], "managing shows inactive ones too");
});

test("reactivating refuses a name that's been taken since", async () => {
  const service = new OfferingService(memoryStore().store);
  const { weddings, s, gold } = await setup(service);
  await service.setPackageArchived(studioA, gold.id, true);
  saved(await service.createPackage(studioA, s.id, tier("Gold", 1)));
  await assert.rejects(service.setPackageArchived(studioA, gold.id, false), /already has a package called “Gold”/);
  await service.setServiceArchived(studioA, s.id, true);
  saved(await service.createService(studioA, weddings.id, "Wedding Photography"));
  await assert.rejects(service.setServiceArchived(studioA, s.id, false), /already called “Wedding Photography”/);
  await service.setCategoryArchived(studioA, weddings.id, true);
  saved(await service.createCategory(studioA, "Weddings"));
  await assert.rejects(service.setCategoryArchived(studioA, weddings.id, false), /already called “Weddings”/);
});

test("showroom settings: defaults until saved, per studio", async () => {
  const service = new OfferingService(memoryStore().store);
  assert.deepEqual(await service.settings(studioA), { showPrices: true, viewMode: "scene" });
  await service.saveSettings(studioA, { showPrices: false, viewMode: "carousel" });
  assert.deepEqual(await service.settings(studioA), { showPrices: false, viewMode: "carousel" });
  assert.deepEqual(await service.settings(studioB), { showPrices: true, viewMode: "scene" });
});

test("one studio can't read, change or use another's categories, services or packages", async () => {
  const { store, categories, services, packages } = memoryStore();
  const service = new OfferingService(store);
  const { weddings, s, gold } = await setup(service);
  const theirs = saved(await service.createCategory(studioB, "Portraits"));
  assert.equal(await service.service(studioB, s.id), null);
  assert.equal(await service.package(studioB, gold.id), null);
  await assert.rejects(service.createService(studioB, weddings.id, "Sneaky"), OfferingError);
  await assert.rejects(service.renameCategory(studioB, weddings.id, "Mine"), OfferingError);
  await assert.rejects(service.setCategoryArchived(studioB, weddings.id, true), OfferingError);
  await assert.rejects(service.renameService(studioB, s.id, "Mine"), OfferingError);
  await assert.rejects(service.setServiceDescription(studioB, s.id, "Mine"), OfferingError);
  await assert.rejects(service.moveService(studioB, s.id, theirs.id), OfferingError);
  await assert.rejects(service.moveService(studioA, s.id, theirs.id), OfferingError, "into another studio's category");
  await assert.rejects(service.createPackage(studioB, s.id, tier("Sneaky", 1)), OfferingError);
  await assert.rejects(service.updatePackage(studioB, gold.id, tier("Gold", 1)), OfferingError);
  await assert.rejects(service.setPackageArchived(studioB, gold.id, true), OfferingError);
  assert.equal(categories[0].name, "Weddings");
  assert.equal(categories[0].archivedAt, null);
  assert.equal(services[0].name, "Wedding Photography");
  assert.equal(services[0].categoryId, weddings.id);
  assert.equal(packages[0].price, 4_000_000);
  assert.deepEqual((await service.showroom(studioB)).map((c) => c.name), [], "an empty category isn't shown");
});

test("a service's showroom page: by its address, on sale only, with its packages on sale, in this studio only", async () => {
  const service = new OfferingService(memoryStore().store);
  const { s, silver } = await setup(service);
  await service.setPackageArchived(studioA, silver.id, true);
  assert.deepEqual((await service.publicService(studioA, "wedding-photography"))?.packages.map((p) => p.name), ["Gold"]);
  assert.equal(await service.publicService(studioB, "wedding-photography"), null);
  assert.equal(await service.publicService(studioA, "nope"), null);
  await service.setServiceArchived(studioA, s.id, true);
  assert.equal(await service.publicService(studioA, "wedding-photography"), null);
});
