import assert from "node:assert/strict";
import { test } from "node:test";

import type { Vendor } from "./core";
import type { VendorStore } from "./ports";
import { VendorService } from "./service";

// The service against an in-memory VendorStore: no database needed.

function memoryStore() {
  const rows = new Map<string, Vendor>();
  const store: VendorStore = {
    byClient: async (clientId) => [...rows.values()].find((v) => v.clientId === clientId) ?? null,
    create: async (clientId, name, join) => {
      const vendor: Vendor = { id: `v${rows.size + 1}`, clientId, name, ...join, status: "active", createdAt: "2026-10-18T00:00:00Z" };
      rows.set(vendor.id, vendor);
      return vendor;
    },
  };
  return { store, rows };
}

const kato = { clientId: "c-kato", name: "Kato Brian" };
const answers = { kind: "business" as const, businessName: "Kato Edits", category: "photo_editor", skills: ["Culling"], socials: { instagram: "kato.edits" } };

test("a vendor joins under its business's name, or else the account's", async () => {
  const { store } = memoryStore();
  const service = new VendorService(store);
  const business = await service.join(kato, answers);
  assert.deepEqual([business.name, business.kind, business.category, business.skills], ["Kato Edits", "business", "photo_editor", ["Culling"]]);
  const solo = await service.join({ clientId: "c-nambi", name: "Nambi Grace" }, { ...answers, kind: "individual", businessName: null });
  assert.equal(solo.name, "Nambi Grace");
  assert.equal((await service.mine("c-nambi"))?.id, solo.id);
  assert.equal(await service.mine("c-nobody"), null);
});

test("joining again gives the vendor the account has, unchanged", async () => {
  const { store, rows } = memoryStore();
  const service = new VendorService(store);
  const first = await service.join(kato, answers);
  const again = await service.join(kato, { ...answers, businessName: "Other", skills: ["Album design"] });
  assert.deepEqual(again, first);
  assert.equal(rows.size, 1);
});
