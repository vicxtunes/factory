import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastWithWhite, type Studio, type StudioListing } from "./core";
import { StudioError, type StudioStore } from "./ports";
import { StudioService } from "./service";

// The service against an in-memory StudioStore: no database needed.

function memoryStore() {
  const rows = new Map<string, Studio>();
  let clock = 0;
  const listing = (s: Studio): StudioListing => ({ ...s, ownerName: `client ${s.ownerClientId}` });
  const store: StudioStore = {
    findByOwner: async (clientId) => [...rows.values()].filter((s) => s.ownerClientId === clientId),
    create: async (owner, kind, vendorCategory) => {
      const studio: Studio = {
        id: `t${rows.size + 1}`,
        ownerClientId: owner.clientId,
        kind,
        vendorCategory,
        name: owner.name,
        phone: null,
        email: null,
        address: null,
        location: null,
        currency: "UGX",
        locale: "en-UG",
        timeZone: "Africa/Kampala",
        createdAt: new Date(Date.UTC(2026, 9, 3, 0, 0, clock++)).toISOString(),
        status: "onboarding",
        logoKey: null,
        brandColor: null,
        showOnAming: false,
        vendorProfile: null,
      };
      rows.set(studio.id, studio);
      return studio;
    },
    updateProfile: async (id, profile) => {
      const studio = { ...rows.get(id)!, ...profile };
      rows.set(id, studio);
      return studio;
    },
    setBrandColor: async (id, brandColor) => {
      const studio = { ...rows.get(id)!, brandColor };
      rows.set(id, studio);
      return studio;
    },
    setVendorProfile: async (id, name, vendorProfile) => {
      const studio = { ...rows.get(id)!, vendorProfile, ...(name ? { name } : {}) };
      rows.set(id, studio);
      return studio;
    },
    setShowOnAming: async (id, showOnAming) => {
      const studio = { ...rows.get(id)!, showOnAming };
      rows.set(id, studio);
      return studio;
    },
    setKind: async (id, kind, vendorCategory) => {
      const studio = rows.get(id)!;
      if ([...rows.values()].some((s) => s.id !== id && s.ownerClientId === studio.ownerClientId && s.kind === kind)) throw new StudioError("You already have one.");
      const changed = { ...studio, kind, vendorCategory };
      rows.set(id, changed);
      return changed;
    },
    list: async () => [...rows.values()].map(listing),
    get: async (id) => (rows.has(id) ? listing(rows.get(id)!) : null),
  };
  return { store, rows };
}

const amina = { clientId: "c-amina", name: "Amina" };
const brian = { clientId: "c-brian", name: "Brian" };
const profile = { name: "Amina Studios", phone: "0700 000000", email: null, address: "Kampala", location: null };

test("opening a studio creates it once, named after the owner", async () => {
  const { store, rows } = memoryStore();
  const service = new StudioService(store);
  const first = await service.open(amina);
  const again = await service.open(amina);
  assert.equal(first.id, again.id);
  assert.equal(first.name, "Amina");
  assert.equal(rows.size, 1);
});

test("each client gets their own studio", async () => {
  const { store } = memoryStore();
  const service = new StudioService(store);
  assert.notEqual((await service.open(amina)).id, (await service.open(brian)).id);
});

test("saving a profile changes only that studio", async () => {
  const { store } = memoryStore();
  const service = new StudioService(store);
  const aminas = await service.open(amina);
  const brians = await service.open(brian);
  const saved = await service.updateProfile(aminas.id, profile);
  assert.equal(saved.ownerClientId, "c-amina");
  assert.equal(saved.name, "Amina Studios");
  assert.equal((await service.get(brians.id))?.name, "Brian");
});

test("a studio's own color is saved made readable", async () => {
  const { store } = memoryStore();
  const service = new StudioService(store);
  const aminas = await service.open(amina);
  assert.equal((await service.setBrandColor(aminas.id, "#1d4ed8")).brandColor, "#1d4ed8");
  const yellow = (await service.setBrandColor(aminas.id, "#ffff00")).brandColor!;
  assert.notEqual(yellow, "#ffff00");
  assert.ok(contrastWithWhite(yellow) >= 4.5);
});

test("the boss's list is newest first", async () => {
  const { store } = memoryStore();
  const service = new StudioService(store);
  await service.open(amina);
  await service.open(brian);
  assert.deepEqual((await service.list()).map((s) => s.ownerClientId), ["c-brian", "c-amina"]);
});

test("an account owns a studio and a vendor business at most, each opened once; a vendor needs its category", async () => {
  const { store, rows } = memoryStore();
  const service = new StudioService(store);
  const studio = await service.open(amina);
  await assert.rejects(service.open(amina, "vendor", null), /what your business does/);
  await assert.rejects(service.open(amina, "vendor", "astronaut"), /what your business does/);
  const vendor = await service.open(amina, "vendor", "videographer");
  assert.deepEqual([studio.kind, vendor.kind, vendor.vendorCategory], ["studio", "vendor", "videographer"]);
  assert.equal((await service.open(amina, "vendor", "decor")).id, vendor.id, "the same vendor business, not a second");
  assert.deepEqual(await service.owned(amina.clientId), { studio, vendor });
  assert.deepEqual(await service.owned(brian.clientId), { studio: null, vendor: null });
  assert.equal(rows.size, 2);
});

test("while setting up, a business can become the other kind, unless the owner has one of that kind", async () => {
  const { store } = memoryStore();
  const service = new StudioService(store);
  const first = await service.open(brian);
  const editor = await service.setKind(first.id, "vendor", "photo_editor");
  assert.deepEqual([editor.kind, editor.vendorCategory], ["vendor", "photo_editor"]);
  assert.deepEqual([(await service.setKind(first.id, "studio", "decor")).vendorCategory], [null], "a studio has no category");
  await service.setKind(first.id, "vendor", "photo_editor");
  await service.open(brian, "studio");
  await assert.rejects(service.setKind(first.id, "studio", null), /already have one/);
  await assert.rejects(service.setKind(first.id, "vendor", "nope"), /what your business does/);
});

test("a vendor joins with its answers, named as it chose; one past set-up keeps what it is", async () => {
  const { store, rows } = memoryStore();
  const service = new StudioService(store);
  const owner = { clientId: "c9", name: "Kato Brian" };
  const profile = { as: "business" as const, skills: ["Colour correction"], socials: { instagram: "kato.edits" } };
  const vendor = await service.joinAsVendor(owner, { category: "photo_editor", businessName: "Kato Edits", profile });
  assert.equal(vendor.kind, "vendor");
  assert.equal(vendor.vendorCategory, "photo_editor");
  assert.equal(vendor.name, "Kato Edits");
  assert.deepEqual(vendor.vendorProfile, profile);

  rows.set(vendor.id, { ...rows.get(vendor.id)!, status: "active" });
  const again = await service.joinAsVendor(owner, { category: "photo_editor", businessName: "Other", profile: { ...profile, skills: ["Culling"] } });
  assert.equal(again.name, "Kato Edits");
  assert.deepEqual(again.vendorProfile, profile);
});
