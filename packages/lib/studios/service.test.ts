import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastWithWhite, type Studio, type StudioListing } from "./core";
import type { StudioStore } from "./ports";
import { StudioService } from "./service";

// The service against an in-memory StudioStore: no database needed.

function memoryStore() {
  const rows = new Map<string, Studio>();
  let clock = 0;
  const listing = (s: Studio): StudioListing => ({ ...s, ownerName: `client ${s.ownerClientId}` });
  const store: StudioStore = {
    findByOwner: async (clientId) => [...rows.values()].find((s) => s.ownerClientId === clientId) ?? null,
    create: async (owner) => {
      const studio: Studio = {
        id: `t${rows.size + 1}`,
        ownerClientId: owner.clientId,
        name: owner.name,
        phone: null,
        email: null,
        address: null,
        currency: "UGX",
        locale: "en-UG",
        timeZone: "Africa/Kampala",
        createdAt: new Date(Date.UTC(2026, 9, 3, 0, 0, clock++)).toISOString(),
        status: "onboarding",
        logoKey: null,
        brandColor: null,
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
    list: async () => [...rows.values()].map(listing),
    get: async (id) => (rows.has(id) ? listing(rows.get(id)!) : null),
  };
  return { store, rows };
}

const amina = { clientId: "c-amina", name: "Amina" };
const brian = { clientId: "c-brian", name: "Brian" };
const profile = { name: "Amina Studios", phone: "0700 000000", email: null, address: "Kampala" };

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
