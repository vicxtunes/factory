import assert from "node:assert/strict";
import { test } from "node:test";

import type { Vendor } from "./core";
import type { VendorFiles, VendorStore } from "./ports";
import { VendorService } from "./service";

// The service against an in-memory VendorStore: no database needed.

function memoryStore() {
  const rows = new Map<string, Vendor>();
  const store: VendorStore = {
    byClient: async (clientId) => [...rows.values()].find((v) => v.clientId === clientId) ?? null,
    create: async (clientId, name, join) => {
      const vendor: Vendor = { id: `v${rows.size + 1}`, clientId, name, ...join, bio: null, location: null, photoKey: null, coverKey: null, status: "active", createdAt: "2026-10-18T00:00:00Z" };
      rows.set(vendor.id, vendor);
      return vendor;
    },
    updateProfile: async (id, profile) => {
      const vendor = { ...rows.get(id)!, ...profile };
      rows.set(id, vendor);
      return vendor;
    },
    workspace: async (id) => `w-${id}`,
    setPicture: async (id, which, key) => {
      const vendor = rows.get(id)!;
      const field = which === "photo" ? "photoKey" : "coverKey";
      rows.set(id, { ...vendor, [field]: key });
      return vendor[field];
    },
  };
  return { store, rows };
}

/** Picture files in memory: key → size. */
function memoryFiles() {
  const objects = new Map<string, number>();
  const files: VendorFiles = {
    putUrl: async (key) => `https://upload/${key}`,
    getUrl: async (key) => `https://view/${key}`,
    size: async (key) => objects.get(key) ?? null,
    move: async (from, to) => {
      objects.set(to, objects.get(from)!);
      objects.delete(from);
    },
    remove: async (keys) => keys.forEach((k) => objects.delete(k)),
  };
  return { files, objects };
}

let ids = 0;
const service = (store: VendorStore) => new VendorService(store, memoryFiles().files, () => `id${++ids}`);

const kato = { clientId: "c-kato", name: "Kato Brian" };
const answers = { kind: "business" as const, businessName: "Kato Edits", category: "photo_editor", skills: ["Culling"], socials: { instagram: "kato.edits" } };

test("a vendor joins under its business's name, or else the account's", async () => {
  const { store } = memoryStore();
  const vendorService = service(store);
  const business = await vendorService.join(kato, answers);
  assert.deepEqual([business.name, business.kind, business.category, business.skills], ["Kato Edits", "business", "photo_editor", ["Culling"]]);
  const solo = await vendorService.join({ clientId: "c-nambi", name: "Nambi Grace" }, { ...answers, kind: "individual", businessName: null });
  assert.equal(solo.name, "Nambi Grace");
  assert.equal((await vendorService.mine("c-nambi"))?.id, solo.id);
  assert.equal(await vendorService.mine("c-nobody"), null);
});

test("joining again gives the vendor the account has, unchanged", async () => {
  const { store, rows } = memoryStore();
  const vendorService = service(store);
  const first = await vendorService.join(kato, answers);
  const again = await vendorService.join(kato, { ...answers, businessName: "Other", skills: ["Album design"] });
  assert.deepEqual(again, first);
  assert.equal(rows.size, 1);
});

test("a vendor edits their own profile; an account that hasn't joined can't", async () => {
  const { store } = memoryStore();
  const vendorService = service(store);
  const joined = await vendorService.join(kato, answers);
  const profile = { name: "Kato Films", kind: "business" as const, category: "videographer", skills: ["Drone"], socials: {}, bio: "Films that feel like the day.", location: "Kampala" };
  const saved = await vendorService.updateProfile(kato.clientId, profile);
  assert.deepEqual({ ...saved, id: joined.id }, { ...joined, ...profile });
  await assert.rejects(vendorService.updateProfile("c-nobody", profile), /Join as a vendor first/);
});

test("a vendor's picture: uploaded to its own place, checked, moved in, and the old one deleted", async () => {
  const { store, rows } = memoryStore();
  const { files, objects } = memoryFiles();
  const pictures = new VendorService(store, files, () => `id${++ids}`);
  const vendor = await pictures.join(kato, answers);

  const first = await pictures.startPictureUpload(kato.clientId, "photo");
  assert.match(first.key, new RegExp(`^incoming/vendors/${vendor.id}/photo-`));
  objects.set(first.key, 200_000);
  await pictures.confirmPicture(kato.clientId, "photo", first.key);
  const placed = rows.get(vendor.id)!.photoKey!;
  assert.match(placed, new RegExp(`^vendors/${vendor.id}/photo-`));
  assert.ok(objects.has(placed) && !objects.has(first.key));

  const second = await pictures.startPictureUpload(kato.clientId, "photo");
  objects.set(second.key, 150_000);
  await pictures.confirmPicture(kato.clientId, "photo", second.key);
  assert.ok(!objects.has(placed), "the old photo is deleted");

  const big = await pictures.startPictureUpload(kato.clientId, "cover");
  objects.set(big.key, 5_000_000);
  await assert.rejects(pictures.confirmPicture(kato.clientId, "cover", big.key), /too large/);
  assert.ok(!objects.has(big.key));
  await assert.rejects(pictures.confirmPicture(kato.clientId, "cover", "vendors/someone-else/cover-x.jpg"), /isn't valid/);
  await assert.rejects(pictures.confirmPicture(kato.clientId, "photo", (await pictures.startPictureUpload(kato.clientId, "photo")).key), /didn't arrive/);
});
